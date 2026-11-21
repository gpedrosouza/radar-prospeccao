export type ExportJobStatus = "queued" | "running" | "completed" | "failed";

/** CnpjExportJob serializado para o cliente (BigInt→string, Date→ISO string). */
export interface SerializedExportJob {
  id: string;
  status: ExportJobStatus;
  filtros: Record<string, unknown>;
  linhas: number | null;
  tamanho_bytes: string | null;
  storage_key: string | null;
  progresso_pct: number;
  erro: string | null;
  criado_em: string;
  concluido_em: string | null;
}
