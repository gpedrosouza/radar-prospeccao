export function Rodape() {
  return (
    <div className="border-t border-white/[0.12] px-6 pb-11 pt-8">
      <div className="mx-auto grid max-w-[640px] gap-4">
        <div className="text-xs leading-[1.8] text-white/55">
          Prefere falar direto com a gente?{" "}
          <a
            href="https://wa.me/5516988037000"
            className="font-semibold text-[#00B3A9] hover:text-[#33cfc6]"
          >
            WhatsApp 55 (16) 9 8803-7000
          </a>{" "}
          ·{" "}
          <a
            href="mailto:contato@grgestaofinanceira.com.br"
            className="font-semibold text-[#00B3A9] hover:text-[#33cfc6]"
          >
            contato@grgestaofinanceira.com.br
          </a>
        </div>
        <div className="text-[11px] leading-[1.8] text-white/35">
          Os dados fornecidos serão utilizados exclusivamente para contato comercial da GR Gestão
          Financeira, conforme a Lei Geral de Proteção de Dados (LGPD). Você pode solicitar a
          exclusão dos seus dados a qualquer momento.
        </div>
      </div>
    </div>
  );
}
