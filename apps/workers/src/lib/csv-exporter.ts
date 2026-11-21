/**
 * Pipeline de exportação CSV → gzip → S3 multipart upload ou arquivo local.
 *
 * Quando R2_ENDPOINT + credenciais estão configuradas, faz upload para S3/R2/MinIO.
 * Caso contrário, escreve em EXPORT_LOCAL_DIR (default: /app) + storageKey.
 * O volume mount ./exports:/app/exports expõe os arquivos locais no host.
 *
 * Fluxo de dados (tudo em streaming, sem carregar o resultado em memória):
 *   DB cursor pages → csv-stringify → zlib.createGzip → ByteCounter → destino
 */

import { createGzip } from "zlib";
import { createWriteStream } from "fs";
import { mkdir, unlink } from "fs/promises";
import path from "path";
import {
  Transform,
  type TransformCallback,
  PassThrough,
} from "stream";
import { stringify } from "csv-stringify";
import { Upload } from "@aws-sdk/lib-storage";
import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import {
  createCnpjRepository,
  classeFromCnae,
  getCnaeDescricaoMap,
  getCnaeEstruturaMap,
  type CnaeEstrutura,
  type FindByFiltersInput,
  basicoFromCnpj,
  getQsaEnrichmentFor,
  getCnaeSecundarioFor,
  type QsaEnrichment,
  type CnpjListItem,
  type PrismaClient,
} from "@radar/db";
import { classificarTipoPessoa, temAtividadeMista } from "@radar/shared";
import { createS3Client, getS3Config, type S3Config } from "./s3-client.js";

// ── Constantes ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 1_000;
const PROGRESS_UPDATE_EVERY = 5_000;
const PART_SIZE_BYTES = 10 * 1024 * 1024;

// ── Colunas do CSV ────────────────────────────────────────────────────────────

const CSV_COLUMNS = [
  { key: "cnpj",                  header: "CNPJ" },
  { key: "razao_social",          header: "Razão Social" },
  { key: "nome_fantasia",         header: "Nome Fantasia" },
  { key: "uf",                    header: "UF" },
  { key: "municipio_nome",        header: "Município" },
  { key: "municipio_codigo",      header: "Cód. Município" },
  { key: "cnae_principal",        header: "CNAE Principal" },
  { key: "cnae_descricao",        header: "CNAE (descrição)" },
  { key: "cnae_secao",            header: "Setor" },
  { key: "cnae_divisao",          header: "Divisão CNAE" },
  { key: "qtd_cnae_secundario",   header: "Qtd CNAE secundário" },
  { key: "atividade_mista",       header: "Atividade mista (B2B+B2C)" },
  { key: "cnae_secundario_desc",  header: "CNAEs secundários" },
  { key: "situacao",              header: "Situação" },
  { key: "porte",                 header: "Porte" },
  { key: "tipo_pessoa",           header: "Tipo" },
  { key: "natureza_juridica_cod", header: "Cód. Natureza Jurídica" },
  { key: "natureza_juridica",     header: "Natureza Jurídica" },
  { key: "capital_social",        header: "Capital Social" },
  { key: "data_abertura",         header: "Data de Abertura" },
  { key: "matriz_filial",         header: "Matriz/Filial" },
  { key: "socio_administrador",   header: "Sócio administrador" },
  { key: "qualificacao_admin",    header: "Qualificação do administrador" },
  { key: "qtd_socios",            header: "Qtd de sócios" },
  { key: "tem_socio_estrangeiro", header: "Sócio estrangeiro" },
  { key: "grupo_tamanho",         header: "Grupo econômico (nº CNPJs)" },
  { key: "opcao_simples",         header: "Optante Simples" },
  { key: "opcao_mei",             header: "Optante MEI" },
  { key: "email",                 header: "E-mail" },
  { key: "telefone",              header: "Telefone" },
  { key: "endereco",              header: "Endereço" },
  { key: "latitude",              header: "Latitude" },
  { key: "longitude",             header: "Longitude" },
];

/** Date → "YYYY-MM-DD" em UTC (a coluna é DATE, sem componente de hora). */
function formatDate(value: Date | null): string {
  return value === null ? "" : value.toISOString().slice(0, 10);
}

/** Dicionários carregados uma vez por job — nunca uma query por linha. */
interface Dicionarios {
  /** natureza jurídica: descrição → código */
  codigoPorDescricao: Map<string, string>;
  /** CNAE subclasse 7 díg → denominação */
  cnaeDescricao: Map<string, string>;
  /** CNAE classe 5 díg → hierarquia (seção/divisão/grupo) */
  cnaeEstrutura: Map<string, CnaeEstrutura>;
}

/** Teto de descrições concatenadas — um CNPJ pode ter dezenas de secundários. */
const MAX_CNAE_SECUNDARIO_DESC = 5;

/**
 * Descrições dos secundários, truncadas. O número exato fica na coluna
 * "Qtd CNAE secundário"; esta é para leitura humana no Excel, não para
 * despejar 40 atividades numa célula.
 */
function descreverSecundarios(
  cnaes: readonly string[],
  descricoes: Map<string, string>
): string {
  const nomes = cnaes
    .slice(0, MAX_CNAE_SECUNDARIO_DESC)
    .map((c) => descricoes.get(c) ?? c);
  const resto = cnaes.length - nomes.length;
  return resto > 0 ? `${nomes.join("; ")} (+${resto})` : nomes.join("; ");
}

function itemToRow(
  item: CnpjListItem,
  dic: Dicionarios,
  qsa: Map<string, QsaEnrichment>,
  secundarios: Map<string, string[]>
): Record<string, string | number | null> {
  const estrutura = dic.cnaeEstrutura.get(classeFromCnae(item.cnae_principal));
  // Ausente é o caso normal, não um erro: empresário individual não tem quadro
  // societário, e só uma minoria dos CNPJs pertence a um grupo econômico.
  const q = qsa.get(basicoFromCnpj(item.cnpj));
  // Idem para os secundários: a maioria dos CNPJs declara só o principal.
  const sec = secundarios.get(item.cnpj) ?? [];
  return {
    cnpj:                  item.cnpj,
    razao_social:          item.razao_social,
    nome_fantasia:         item.nome_fantasia,
    uf:                    item.uf,
    municipio_nome:        item.municipio_nome,
    municipio_codigo:      item.municipio_codigo,
    cnae_principal:        item.cnae_principal,
    cnae_descricao:        dic.cnaeDescricao.get(item.cnae_principal) ?? "",
    cnae_secao:            estrutura?.secao_desc ?? "",
    cnae_divisao:          estrutura?.divisao_desc ?? "",
    qtd_cnae_secundario:   sec.length,
    // A regra B2B/B2C vem de @radar/shared, a mesma que classifica o
    // principal — nunca reimplementada aqui (ver categoria-cnae.ts).
    atividade_mista:       temAtividadeMista(item.cnae_principal, sec) ? "Sim" : "Não",
    cnae_secundario_desc:  descreverSecundarios(sec, dic.cnaeDescricao),
    situacao:              item.situacao,
    porte:                 item.porte,
    tipo_pessoa:           classificarTipoPessoa(item.natureza_juridica, item.opcao_mei),
    natureza_juridica_cod:
      item.natureza_juridica !== null
        ? dic.codigoPorDescricao.get(item.natureza_juridica) ?? ""
        : "",
    natureza_juridica:     item.natureza_juridica ?? "",
    capital_social:        item.capital_social ?? "",
    data_abertura:         formatDate(item.data_abertura),
    matriz_filial:         item.matriz_filial ?? "",
    // LGPD: nome e qualificação do decisor, nunca CPF — cpf_cnpj_socio não sai
    // de staging_socio (ver socio-lookup.ts).
    socio_administrador:   q?.socio_administrador ?? "",
    qualificacao_admin:    q?.qualificacao_admin ?? "",
    qtd_socios:            q !== undefined ? q.qtd_socios : "",
    tem_socio_estrangeiro: q !== undefined ? (q.tem_socio_estrangeiro ? "Sim" : "Não") : "",
    // Vazio quando o CNPJ não faz parte de grupo — "1" sugeriria falsamente
    // que ele foi avaliado e forma um grupo de um.
    grupo_tamanho:         q?.grupo_tamanho ?? "",
    opcao_simples:         item.opcao_simples ? "Sim" : "Não",
    opcao_mei:             item.opcao_mei ? "Sim" : "Não",
    email:                 item.email,
    telefone:              item.telefone,
    endereco:              item.endereco,
    latitude:              item.latitude,
    longitude:             item.longitude,
  };
}

// ── ByteCounter ───────────────────────────────────────────────────────────────

/** Transform pass-through que acumula o total de bytes comprimidos. */
class ByteCounter extends Transform {
  bytes = 0;

  _transform(chunk: Buffer, _enc: BufferEncoding, cb: TransformCallback) {
    this.bytes += chunk.length;
    this.push(chunk);
    cb();
  }
}

// ── Tipos públicos ────────────────────────────────────────────────────────────

export interface ExportResult {
  storageKey: string;
  totalRows: number;
  sizeBytes: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function isR2Available(): boolean {
  return !!(
    process.env.R2_ENDPOINT &&
    process.env.R2_ACCESS_KEY_ID &&
    process.env.R2_SECRET_ACCESS_KEY &&
    process.env.R2_BUCKET
  );
}

/** Pagina o banco e escreve linhas no stringifier, respeitando backpressure. */
async function feedCursor(
  prisma: PrismaClient,
  filters: FindByFiltersInput,
  stringifier: ReturnType<typeof stringify>,
  onProgress: (rowsProcessed: number) => Promise<void>
): Promise<number> {
  const cnpjRepo = createCnpjRepository(prisma);
  const [codigoPorDescricao, cnaeDescricao, cnaeEstrutura] = await Promise.all([
    cnpjRepo.getCodigoPorDescricaoNatureza(),
    getCnaeDescricaoMap(prisma),
    getCnaeEstruturaMap(prisma),
  ]);
  const dic: Dicionarios = { codigoPorDescricao, cnaeDescricao, cnaeEstrutura };
  let totalRows = 0;
  let lastProgressRows = 0;
  let cursor: bigint | undefined;

  while (true) {
    const page = await cnpjRepo.findByFilters(filters, {
      cursor,
      limit: PAGE_SIZE,
    });

    // Uma resolução de QSA por página (2 queries indexadas para 1.000 CNPJs),
    // nunca por linha. Ver socio-lookup.ts para por que não há Map global.
    // Mesmo princípio para os CNAEs secundários: uma query por página, pelo
    // prefixo da PK. A tabela tem dezenas de milhões de linhas e não cabe num
    // Map de módulo (ver cnae-secundario-lookup.ts).
    const cnpjs = page.items.map((i) => i.cnpj);
    const [qsa, secundarios] = await Promise.all([
      getQsaEnrichmentFor(prisma, cnpjs),
      getCnaeSecundarioFor(prisma, cnpjs),
    ]);

    for (const item of page.items) {
      const canContinue = stringifier.write(
        itemToRow(item, dic, qsa, secundarios)
      );
      if (!canContinue) {
        await new Promise<void>((resolve, reject) => {
          stringifier.once("drain", resolve);
          stringifier.once("error", reject);
        });
      }
      totalRows++;
    }

    if (totalRows - lastProgressRows >= PROGRESS_UPDATE_EVERY) {
      await onProgress(totalRows);
      lastProgressRows = totalRows;
    }

    if (page.nextCursor === null) break;
    cursor = page.nextCursor;
  }

  return totalRows;
}

// ── Implementação S3/R2 ───────────────────────────────────────────────────────

async function exportToCsvS3(
  prisma: PrismaClient,
  filters: FindByFiltersInput,
  storageKey: string,
  onProgress: (rowsProcessed: number) => Promise<void>
): Promise<ExportResult> {
  const config: S3Config = getS3Config();
  const s3 = createS3Client(config);

  const stringifier = stringify({ header: true, columns: CSV_COLUMNS });
  const gzip = createGzip({ level: 6 });
  const byteCounter = new ByteCounter();
  const passThrough = new PassThrough();

  stringifier.pipe(gzip).pipe(byteCounter).pipe(passThrough);

  const streamError = new Promise<never>((_, reject) => {
    for (const s of [stringifier, gzip, byteCounter, passThrough]) {
      s.on("error", (err: Error) =>
        reject(new Error(`Stream error: ${err.message}`))
      );
    }
  });

  const upload = new Upload({
    client: s3,
    params: {
      Bucket:          config.bucket,
      Key:             storageKey,
      Body:            passThrough,
      ContentType:     "text/csv",
      ContentEncoding: "gzip",
    },
    partSize:  PART_SIZE_BYTES,
    queueSize: 2,
  });

  let totalRows = 0;

  const feedAndUpload = async (): Promise<void> => {
    totalRows = await feedCursor(prisma, filters, stringifier, onProgress);
    stringifier.end();
    await upload.done();
  };

  try {
    await Promise.race([feedAndUpload(), streamError]);
    return { storageKey, totalRows, sizeBytes: byteCounter.bytes };
  } catch (err) {
    for (const s of [stringifier, gzip, byteCounter, passThrough]) {
      s.destroy();
    }
    await upload.abort().catch(() => {});
    await s3
      .send(new DeleteObjectCommand({ Bucket: config.bucket, Key: storageKey }))
      .catch(() => {});
    throw err;
  }
}

// ── Implementação local ───────────────────────────────────────────────────────

async function exportToCsvLocal(
  prisma: PrismaClient,
  filters: FindByFiltersInput,
  storageKey: string,
  onProgress: (rowsProcessed: number) => Promise<void>
): Promise<ExportResult> {
  // EXPORT_LOCAL_DIR=/app em Docker + volume mount ./exports:/app/exports
  // → path.join('/app', 'exports/{jobId}/{ts}.csv.gz') = /app/exports/{jobId}/{ts}.csv.gz
  // → acessível no host em {projeto}/exports/{jobId}/{ts}.csv.gz
  const localDir = process.env.EXPORT_LOCAL_DIR ?? "/app";
  const filePath = path.join(localDir, storageKey);

  await mkdir(path.dirname(filePath), { recursive: true });

  const stringifier = stringify({ header: true, columns: CSV_COLUMNS });
  const gzip = createGzip({ level: 6 });
  const byteCounter = new ByteCounter();
  const fileStream = createWriteStream(filePath);

  stringifier.pipe(gzip).pipe(byteCounter).pipe(fileStream);

  const streamError = new Promise<never>((_, reject) => {
    for (const s of [stringifier, gzip, byteCounter]) {
      s.on("error", (err: Error) =>
        reject(new Error(`Stream error: ${err.message}`))
      );
    }
    fileStream.on("error", (err: Error) =>
      reject(new Error(`File write error: ${err.message}`))
    );
  });

  let totalRows = 0;

  const feedAndWrite = async (): Promise<void> => {
    totalRows = await feedCursor(prisma, filters, stringifier, onProgress);
    stringifier.end();

    await new Promise<void>((resolve, reject) => {
      fileStream.once("finish", resolve);
      fileStream.once("error", reject);
    });
  };

  try {
    await Promise.race([feedAndWrite(), streamError]);

    // Prefixo "local:" identifica o tipo de storage no banco.
    return {
      storageKey: `local:${storageKey}`,
      totalRows,
      sizeBytes: byteCounter.bytes,
    };
  } catch (err) {
    for (const s of [stringifier, gzip, byteCounter, fileStream]) {
      s.destroy();
    }
    await unlink(filePath).catch(() => {});
    throw err;
  }
}

// ── Ponto de entrada público ──────────────────────────────────────────────────

/**
 * Exporta company_cnpj filtrado para CSV gzipado.
 *
 * Se R2_ENDPOINT + credenciais estiverem configuradas: upload para S3/R2/MinIO.
 * Caso contrário: escreve em EXPORT_LOCAL_DIR/storageKey no disco local.
 */
export async function exportToCsv(
  prisma: PrismaClient,
  filters: FindByFiltersInput,
  storageKey: string,
  onProgress: (rowsProcessed: number) => Promise<void>
): Promise<ExportResult> {
  if (isR2Available()) {
    return exportToCsvS3(prisma, filters, storageKey, onProgress);
  }
  return exportToCsvLocal(prisma, filters, storageKey, onProgress);
}
