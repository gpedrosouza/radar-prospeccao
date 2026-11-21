interface Props {
  numero: string;
  titulo: string;
}

/** Eyebrow numerado + risco teal — reaparece em cada etapa do fluxo (01/02/03). */
export function SectionHeading({ numero, titulo }: Props) {
  return (
    <>
      <div className="text-[11px] font-bold tracking-[4px] text-[#00B3A9]">
        {numero} · {titulo}
      </div>
      <div className="mb-7 mt-4 h-[2px] w-12 bg-[#00B3A9]" />
    </>
  );
}
