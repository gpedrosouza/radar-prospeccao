import { SectionHeading } from "./SectionHeading";
import type { DadosLead } from "./types";

interface Props {
  dados: DadosLead;
  onChange: (dados: DadosLead) => void;
}

function Campo({
  id,
  label,
  opcional,
  type,
  value,
  placeholder,
  onChange,
}: {
  id: string;
  label: string;
  opcional?: boolean;
  type: "text" | "email" | "tel";
  value: string;
  placeholder: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="grid gap-2">
      <label
        htmlFor={id}
        className="text-[11px] font-semibold tracking-[2px] text-white/55"
      >
        {label.toUpperCase()}
        {opcional && (
          <span className="font-normal normal-case tracking-normal text-white/35"> (opcional)</span>
        )}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-[2px] border border-white/[0.18] bg-white/5 p-4 text-[15px] text-white outline-none transition-colors placeholder:text-white/30 focus:border-[#00B3A9]"
      />
    </div>
  );
}

export function FormularioLead({ dados, onChange }: Props) {
  return (
    <div className="animate-[grFade_0.6s_ease_both] pt-12">
      <SectionHeading numero="01" titulo="SEUS DADOS" />
      <div className="grid gap-[22px]">
        <Campo
          id="ag-nome"
          label="Nome"
          type="text"
          value={dados.nome}
          placeholder="Seu nome completo"
          onChange={(nome) => onChange({ ...dados, nome })}
        />
        <Campo
          id="ag-email"
          label="E-mail"
          type="email"
          value={dados.email}
          placeholder="voce@empresa.com.br"
          onChange={(email) => onChange({ ...dados, email })}
        />
        <Campo
          id="ag-tel"
          label="Telefone"
          opcional
          type="tel"
          value={dados.telefone}
          placeholder="(16) 9 0000-0000"
          onChange={(telefone) => onChange({ ...dados, telefone })}
        />
      </div>
    </div>
  );
}
