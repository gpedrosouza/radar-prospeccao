import { SectionHeading } from "./SectionHeading";
import { gerarDiasUteis } from "./utils";

interface Props {
  dataSelecionada: string | null;
  onSelecionar: (chave: string) => void;
}

const dias = gerarDiasUteis();

export function SeletorData({ dataSelecionada, onSelecionar }: Props) {
  return (
    <div className="animate-[grFade_0.6s_ease_both] pt-14">
      <SectionHeading numero="02" titulo="ESCOLHA A DATA" />
      <div className="flex gap-2 overflow-x-auto pb-2.5 [scrollbar-width:thin]">
        {dias.map((d) => {
          const selecionado = d.chave === dataSelecionada;
          return (
            <button
              key={d.chave}
              type="button"
              onClick={() => onSelecionar(d.chave)}
              className="flex-[0_0_74px] rounded-[2px] py-3.5 pb-3 text-center font-sans transition-colors"
              style={
                selecionado
                  ? { background: "#00B3A9", border: "1px solid #00B3A9", color: "#00222f" }
                  : { background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.15)", color: "#fff" }
              }
            >
              <div className="text-[10px] font-semibold tracking-[2px] opacity-75">{d.dow}</div>
              <div className="font-serif text-[26px] leading-[1.2]">{d.num}</div>
              <div className="text-[10px] tracking-[2px] opacity-75">{d.mes}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
