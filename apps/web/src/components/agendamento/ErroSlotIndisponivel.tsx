export function ErroSlotIndisponivel() {
  return (
    <div
      className="mb-5 animate-[grFade_0.4s_ease_both] rounded-[2px] px-5 py-4"
      style={{ background: "rgba(216,160,70,.08)", border: "1px solid rgba(216,160,70,.4)" }}
    >
      <div className="text-xs font-bold tracking-[1.5px] text-[#e0b56a]">
        HORÁRIO INDISPONÍVEL
      </div>
      <div className="mt-1.5 text-[13px] leading-[1.7] text-white/70">
        Esse horário acabou de ser reservado por outra pessoa. Escolha outro horário disponível
        abaixo.
      </div>
    </div>
  );
}
