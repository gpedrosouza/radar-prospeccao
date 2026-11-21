/**
 * Helpers compartilhados entre import-cnefe.ts (agrega por município) e
 * import-cnefe-ceps.ts (agrega por CEP) — mesma lógica de streaming,
 * resolução de header por nome de coluna e descoberta de arquivo por UF,
 * só muda a chave de agregação e a fonte dos dados (Coordenadas_enderecos
 * vs Arquivos_CNEFE, ver comentários nos respectivos scripts).
 */

import { createReadStream, readdirSync } from "fs";
import { createInterface } from "readline";
import path from "path";

// ── UF ────────────────────────────────────────────────────────────────────────

/** Código IBGE de UF (2 dígitos) → sigla. Tabela estável, não muda. */
export const CODIGO_UF_PARA_SIGLA: Record<string, string> = {
  "11": "RO", "12": "AC", "13": "AM", "14": "RR", "15": "PA", "16": "AP", "17": "TO",
  "21": "MA", "22": "PI", "23": "CE", "24": "RN", "25": "PB", "26": "PE", "27": "AL",
  "28": "SE", "29": "BA", "31": "MG", "32": "ES", "33": "RJ", "35": "SP", "41": "PR",
  "42": "SC", "43": "RS", "50": "MS", "51": "MT", "52": "GO", "53": "DF",
};

export const TODAS_UFS = Object.values(CODIGO_UF_PARA_SIGLA).sort();

/**
 * Varre um diretório procurando CSVs nomeados "{codigo_uf}.csv" ou
 * "{codigo_uf}_{SIGLA}.csv" (ex: "35.csv" ou "35_SP.csv") e retorna um mapa
 * UF → caminho completo. Arquivos com código de UF desconhecido são
 * ignorados com aviso, não travam a descoberta dos demais.
 */
export function descobrirArquivosPorUf(dir: string): Map<string, string> {
  const arquivos = new Map<string, string>();
  for (const nome of readdirSync(dir)) {
    const match = nome.match(/^(\d{2})(?:_[A-Za-z]{2})?\.csv$/i);
    if (!match) continue;
    const uf = CODIGO_UF_PARA_SIGLA[match[1]];
    if (!uf) {
      console.warn(`  [aviso] "${nome}" tem código de UF desconhecido (${match[1]}), ignorando.`);
      continue;
    }
    arquivos.set(uf, path.join(dir, nome));
  }
  return arquivos;
}

/** UFs do Brasil que não aparecem no mapa de arquivos encontrados. */
export function ufsFaltando(encontradas: Iterable<string>): string[] {
  const set = new Set(encontradas);
  return TODAS_UFS.filter((uf) => !set.has(uf));
}

// ── Streaming + agregação lat/lng por chave ────────────────────────────────────

export interface Agg {
  sumLat: number;
  sumLng: number;
  count: number;
}

export interface StreamAggregateResult<K> {
  aggregates: Map<K, Agg>;
  linhasLidas: number;
  linhasInvalidas: number;
}

export interface StreamAggregateOptions<K> {
  filePath: string;
  delimiter: string;
  /** Nomes de coluna (case-insensitive) que precisam existir no header. */
  requiredColumns: string[];
  /**
   * A partir dos campos da linha + índices resolvidos do header (mesmas
   * chaves de requiredColumns), retorna a chave de agregação e lat/lng, ou
   * null se a linha for inválida (contada em linhasInvalidas, não
   * interrompe o import).
   */
  parseRow: (fields: string[], colIdx: Record<string, number>) => { key: K; lat: number; lng: number } | null;
  /** Chamado periodicamente (a cada 2M linhas) para log de progresso. */
  onProgress?: (linhasLidas: number) => void;
}

/**
 * Lê um CSV em streaming (readline) e acumula soma/contagem de lat/lng por
 * chave de agregação. Uso de memória é O(chaves únicas encontradas), não
 * O(linhas do arquivo) — cabe folgado mesmo para arquivos de vários GB,
 * já que tanto municípios (~5.570 no Brasil) quanto CEPs únicos (dezenas de
 * milhares por UF, no pior caso) são órdens de magnitude menores que o
 * volume de linhas.
 *
 * Resolve os índices de coluna pelo NOME do header, não por posição fixa —
 * mais robusto a pequenas variações entre edições/downloads do CNEFE.
 */
export async function streamAggregateLatLng<K>(
  options: StreamAggregateOptions<K>
): Promise<StreamAggregateResult<K>> {
  const { filePath, delimiter, requiredColumns, parseRow, onProgress } = options;
  const aggregates = new Map<K, Agg>();
  let linhasLidas = 0;
  let linhasInvalidas = 0;
  let colIdx: Record<string, number> | null = null;

  const rl = createInterface({
    input: createReadStream(filePath, { encoding: "utf-8" }),
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    if (line.length === 0) continue;

    if (colIdx === null) {
      const headers = line.split(delimiter).map((h) => h.trim().toUpperCase());
      const resolved: Record<string, number> = {};
      const faltando: string[] = [];
      for (const col of requiredColumns) {
        const idx = headers.indexOf(col.toUpperCase());
        if (idx === -1) faltando.push(col);
        else resolved[col] = idx;
      }
      if (faltando.length > 0) {
        throw new Error(
          `Cabeçalho inesperado em ${filePath}: coluna(s) ${faltando.join(", ")} não encontrada(s). ` +
            `Header real: "${line}". Confira contra o dicionário do IBGE — o nome exato das colunas ` +
            `pode variar entre edições/downloads do CNEFE.`
        );
      }
      colIdx = resolved;
      continue;
    }

    linhasLidas++;
    const fields = line.split(delimiter);
    const parsed = parseRow(fields, colIdx);

    if (!parsed || !Number.isFinite(parsed.lat) || !Number.isFinite(parsed.lng)) {
      linhasInvalidas++;
    } else {
      const existing = aggregates.get(parsed.key);
      if (existing) {
        existing.sumLat += parsed.lat;
        existing.sumLng += parsed.lng;
        existing.count += 1;
      } else {
        aggregates.set(parsed.key, { sumLat: parsed.lat, sumLng: parsed.lng, count: 1 });
      }
    }

    if (onProgress && linhasLidas % 2_000_000 === 0) {
      onProgress(linhasLidas);
    }
  }

  return { aggregates, linhasLidas, linhasInvalidas };
}
