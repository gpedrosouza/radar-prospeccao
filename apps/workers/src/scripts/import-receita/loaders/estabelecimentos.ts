import path from "node:path";
import { getClient, query } from "../db.js";
import {
  processFile,
  findFiles,
  ESTABELECIMENTO_BASENAMES,
} from "../zip-reader.js";
import { streamCsvToCopy, type ParseRowFn } from "../csv-copy.js";
import {
  truncateStagingEstabelecimento,
  indexStagingTables,
  dropStagingIndexes,
} from "../schema.js";
import type { ImportConfig } from "../config.js";

// UFs válidas do Brasil
const UFS_VALIDAS = new Set([
  "AC","AL","AP","AM","BA","CE","DF","ES","GO","MA",
  "MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN",
  "RS","RO","RR","SC","SP","SE","TO",
]);

// Colunas do CSV Estabelecimentos (0-indexed, 30 campos):
// 0:  cnpj_basico        1:  cnpj_ordem        2:  cnpj_dv
// 3:  identificador_mf   4:  nome_fantasia      5:  situacao_cadastral
// 6:  data_situacao      7:  motivo_situacao    8:  nome_cidade_exterior
// 9:  pais               10: data_inicio        11: cnae_principal
// 12: cnae_secundario    13: tipo_logradouro    14: logradouro
// 15: numero             16: complemento        17: bairro
// 18: cep                19: uf                 20: municipio_codigo
// 21: ddd1               22: telefone1          23: ddd2
// 24: telefone2          25: ddd_fax            26: fax
// 27: email              28: situacao_especial  29: data_situacao_especial
const parseEstabelecimentoRow: ParseRowFn = (fields) => {
  if (fields.length < 30) return null;

  // Filtro 1: apenas situação cadastral Ativa (código '02').
  // Aplicado aqui, no momento do COPY, para que a staging table contenha
  // somente os ~20M de registros ativos em vez dos ~66M brutos.
  // Suspensos, Inaptos, Baixados e Nulos são descartados sem custo de disco.
  if ((fields[5] ?? "").trim() !== "02") return null;

  const cnpjBasico = (fields[0] ?? "").trim().padStart(8, "0");
  const cnpjOrdem  = (fields[1] ?? "").trim().padStart(4, "0");
  const cnpjDv     = (fields[2] ?? "").trim().padStart(2, "0");
  const uf         = (fields[19] ?? "").trim().toUpperCase();

  // Descarta registros sem UF válida (ex: exterior sem UF)
  if (!cnpjBasico || !UFS_VALIDAS.has(uf)) return null;

  const str  = (i: number) => (fields[i] ?? "").trim() || null;
  const date = (i: number) => {
    const s = (fields[i] ?? "").trim();
    return s && s !== "00000000" ? s : null;
  };

  return [
    cnpjBasico,
    cnpjOrdem,
    cnpjDv,
    str(3),   // identificador_mf
    str(4),   // nome_fantasia
    str(5),   // situacao_cadastral
    date(6),  // data_situacao_cadastral
    str(7),   // motivo_situacao_cadastral
    str(8),   // nome_cidade_exterior
    str(9),   // pais
    date(10), // data_inicio_atividade
    str(11),  // cnae_principal (7 dígitos ou null)
    str(12),  // cnae_secundario
    str(13),  // tipo_logradouro
    str(14),  // logradouro
    str(15),  // numero
    str(16),  // complemento
    str(17),  // bairro
    str(18),  // cep
    uf,
    str(20),  // municipio_codigo
    str(21),  // ddd1
    str(22),  // telefone1
    str(23),  // ddd2
    str(24),  // telefone2
    str(25),  // ddd_fax
    str(26),  // fax
    str(27),  // email
    str(28),  // situacao_especial
    date(29), // data_situacao_especial
  ];
};

const COPY_SQL =
  "COPY staging_estabelecimento " +
  "(cnpj_basico, cnpj_ordem, cnpj_dv, identificador_mf, nome_fantasia, " +
  "situacao_cadastral, data_situacao_cadastral, motivo_situacao_cadastral, " +
  "nome_cidade_exterior, pais, data_inicio_atividade, cnae_principal, " +
  "cnae_secundario, tipo_logradouro, logradouro, numero, complemento, " +
  "bairro, cep, uf, municipio_codigo, ddd1, telefone1, ddd2, telefone2, " +
  "ddd_fax, fax, email, situacao_especial, data_situacao_especial) " +
  "FROM STDIN WITH (FORMAT text, NULL '\\N')";

// Combina staging_estabelecimento + staging_empresa + staging_simples + lookups
// e insere na tabela particionada company_cnpj.
//
// Filtros de negócio aplicados aqui:
//   1. Somente situação Ativa — garantido pelo parseEstabelecimentoRow, mas a
//      staging_estabelecimento só contém código '02', então não precisa repetir.
//   2. Excluir MEI — verificado via LEFT JOIN com staging_simples.
//      MEI não são alvo de prospecção por personal bankers.
//
// O Postgres redireciona automaticamente cada linha para a partição correta
// com base no valor de `uf` (PARTITION BY LIST(uf) — PG 10+).
const INSERT_INTO_COMPANY_CNPJ = `
INSERT INTO company_cnpj (
  cnpj, razao_social, nome_fantasia, uf, municipio_codigo, municipio_nome,
  cnae_principal, situacao, porte, natureza_juridica, matriz_filial,
  opcao_simples, opcao_mei, data_abertura, capital_social,
  email, telefone, endereco
)
SELECT
  -- CNPJ completo: 8 + 4 + 2 = 14 dígitos
  LPAD(e.cnpj_basico, 8, '0') || LPAD(e.cnpj_ordem, 4, '0') || LPAD(e.cnpj_dv, 2, '0'),

  emp.razao_social,

  NULLIF(TRIM(e.nome_fantasia), ''),

  e.uf,

  -- municipio_codigo: converte TEXT → INT, fallback 0 se inválido
  COALESCE(NULLIF(TRIM(e.municipio_codigo), '')::INTEGER, 0),

  -- municipio_nome: prefere lookup, fallback string vazia (NOT NULL no schema)
  COALESCE(NULLIF(TRIM(m.descricao), ''), ''),

  -- cnae_principal: 7 dígitos, fallback '0000000' se ausente
  COALESCE(NULLIF(TRIM(e.cnae_principal), ''), '0000000'),

  -- situacao: staging já contém apenas código '02' (filtro no parseEstabelecimentoRow)
  'Ativa',

  -- porte: decodifica código
  CASE TRIM(emp.porte)
    WHEN '01' THEN 'Micro'
    WHEN '03' THEN 'Pequena'
    WHEN '05' THEN 'Demais'
    ELSE NULL
  END,

  NULLIF(TRIM(nj.descricao), ''),

  -- matriz_filial
  CASE TRIM(e.identificador_mf)
    WHEN '1' THEN 'Matriz'
    WHEN '2' THEN 'Filial'
    ELSE NULL
  END,

  -- opcao_simples: S → true. Optantes do Simples não-MEI são válidos para prospecção.
  COALESCE(s.opcao_simples = 'S', FALSE),
  -- opcao_mei: sempre FALSE após o filtro MEI no WHERE, mantido para consistência de schema
  FALSE,

  -- data_abertura: converte YYYYMMDD → DATE, ignora datas inválidas
  CASE
    WHEN e.data_inicio_atividade ~ '^[0-9]{8}$'
     AND e.data_inicio_atividade != '00000000'
    THEN TO_DATE(e.data_inicio_atividade, 'YYYYMMDD')
    ELSE NULL
  END,

  -- capital_social: substitui vírgula decimal brasileira por ponto
  CASE
    WHEN TRIM(emp.capital_social) ~ '^[0-9]+,[0-9]+$'
    THEN REPLACE(TRIM(emp.capital_social), ',', '.')::DECIMAL(15,2)
    WHEN TRIM(emp.capital_social) ~ '^[0-9]+(\\.[0-9]+)?$'
    THEN TRIM(emp.capital_social)::DECIMAL(15,2)
    ELSE NULL
  END,

  NULLIF(LOWER(TRIM(e.email)), ''),

  -- telefone: concatena DDD + número principal
  NULLIF(TRIM(COALESCE(e.ddd1, '') || COALESCE(e.telefone1, '')), ''),

  -- endereco: monta string legível
  NULLIF(TRIM(CONCAT_WS(' ',
    NULLIF(TRIM(e.tipo_logradouro), ''),
    NULLIF(TRIM(e.logradouro),      ''),
    NULLIF(TRIM(e.numero),          ''),
    NULLIF(TRIM(e.complemento),     ''),
    NULLIF(TRIM(e.bairro),          ''),
    NULLIF(TRIM(e.cep),             '')
  )), '')

FROM staging_estabelecimento e
JOIN staging_empresa emp
  ON emp.cnpj_basico = e.cnpj_basico
LEFT JOIN staging_simples s
  ON s.cnpj_basico = e.cnpj_basico
LEFT JOIN lookup_municipio_rf m
  ON m.codigo = LPAD(TRIM(COALESCE(e.municipio_codigo, '')), 7, '0')
LEFT JOIN lookup_natureza_juridica nj
  ON nj.codigo = LPAD(TRIM(COALESCE(emp.natureza_juridica, '')), 4, '0')
WHERE e.uf = ANY(ARRAY[
  'AC','AL','AP','AM','BA','CE','DF','ES','GO','MA',
  'MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN',
  'RS','RO','RR','SC','SP','SE','TO'
])
  -- Filtro 2: excluir MEI — não são alvo de prospecção para personal bankers
  AND COALESCE(s.opcao_mei, 'N') != 'S'
`;

export async function loadEstabelecimentos(cfg: ImportConfig): Promise<void> {
  const client = await getClient();
  const files = findFiles(cfg.cnpjDir, ESTABELECIMENTO_BASENAMES);

  if (files.length === 0) {
    console.warn(
      `  Aviso: nenhum arquivo Estabelecimentos*.zip encontrado em ${cfg.cnpjDir}`,
    );
    return;
  }

  if (cfg.truncateStaging) {
    console.log("  Truncando staging_estabelecimento...");
    await truncateStagingEstabelecimento();
    // Remove índices de staging antes do COPY (serão recriados depois)
    await dropStagingIndexes();
  }

  let grandTotal = 0;
  let grandSkipped = 0;

  // Fase 1: COPY dos CSVs para staging_estabelecimento
  console.log("\n  [Fase 1/2] Carregando estabelecimentos para staging...");

  for (const filePath of files) {
    console.log(`  Carregando ${path.basename(filePath)}...`);
    let fileRows = 0;
    let fileSkipped = 0;

    await processFile(filePath, async (_entryName, stream) => {
      const stats = await streamCsvToCopy(
        stream,
        client,
        COPY_SQL,
        parseEstabelecimentoRow,
        {
          encoding: cfg.encoding,
          maxRows: cfg.maxRows ? cfg.maxRows - grandTotal : undefined,
          progressEvery: cfg.progressEvery,
          label: "Estabelecimentos",
        },
      );
      fileRows += stats.rows;
      fileSkipped += stats.skipped;
      grandTotal += stats.rows;
      grandSkipped += stats.skipped;
    });

    console.log(
      `  ${path.basename(filePath)}: ${fileRows.toLocaleString("pt-BR")} registros` +
        (fileSkipped > 0 ? `, ${fileSkipped} ignorados` : ""),
    );

    if (cfg.maxRows && grandTotal >= cfg.maxRows) break;
  }

  // Fase 2: Criar índices nas staging tables antes do JOIN massivo
  console.log("\n  [Fase 2/2] Criando índices de staging e inserindo em company_cnpj...");
  await indexStagingTables();

  if (cfg.truncateTarget) {
    console.log("  TRUNCATE company_cnpj (RECEITA_IMPORT_TRUNCATE_TARGET=true)...");
    await query("TRUNCATE TABLE company_cnpj");
  }

  // INSERT/SELECT combina staging_estabelecimento + staging_empresa + staging_simples
  console.log("  Executando INSERT INTO company_cnpj SELECT ... (pode demorar)...");
  const result = await client.query(INSERT_INTO_COMPANY_CNPJ);
  const inserted = result.rowCount ?? 0;

  console.log(
    `\n  Estabelecimentos: ${grandTotal.toLocaleString("pt-BR")} na staging` +
      (grandSkipped > 0 ? `, ${grandSkipped} ignorados` : "") +
      `\n  company_cnpj: ${inserted.toLocaleString("pt-BR")} registros inseridos`,
  );
}
