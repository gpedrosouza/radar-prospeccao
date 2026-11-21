export interface DiaUtil {
  data: Date;
  /** "YYYY-MM-DD" — chave usada pra chamar a API de disponibilidade. */
  chave: string;
  dow: string;
  num: string;
  mes: string;
}

/** "YYYY-MM-DD" a partir de um Date, no calendário local do navegador. */
function toDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Próximos 14 dias úteis a partir de amanhã (sem sábado/domingo). */
export function gerarDiasUteis(hoje: Date = new Date()): DiaUtil[] {
  const dias: DiaUtil[] = [];
  const cursor = new Date(hoje);
  cursor.setDate(cursor.getDate() + 1);

  while (dias.length < 14) {
    const dow = cursor.getDay();
    if (dow !== 0 && dow !== 6) {
      dias.push({
        data: new Date(cursor),
        chave: toDateKey(cursor),
        dow: cursor
          .toLocaleDateString("pt-BR", { weekday: "short" })
          .replace(".", "")
          .toUpperCase(),
        num: String(cursor.getDate()).padStart(2, "0"),
        mes: cursor.toLocaleDateString("pt-BR", { month: "short" }).replace(".", "").toUpperCase(),
      });
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  return dias;
}

export function formatarDataCompleta(d: Date): string {
  return d.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" });
}

export function formatarDataCurta(d: Date): string {
  return d
    .toLocaleDateString("pt-BR", { weekday: "short", day: "numeric", month: "short" })
    .replace(/\./g, "");
}

export function formatarHora(iso: string): string {
  return new Date(iso).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  });
}
