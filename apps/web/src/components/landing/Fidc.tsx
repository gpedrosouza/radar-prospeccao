import { ScrollReveal } from "./ScrollReveal";

const ITEMS = [
  {
    title: "Cessão com direito de regresso",
    desc: "Operação tradicional de desconto de títulos. Em caso de inadimplência, o cedente realiza a recompra. Liquidez rápida com estrutura conhecida.",
  },
  {
    title: "Cessão sem direito de regresso",
    desc: "Produto pouco praticado por bancos: em caso de inadimplência do sacado, o cedente não é obrigado a recomprar o título — salvo vícios.",
  },
  {
    title: "Operações de risco sacado",
    desc: "O risco de crédito é do pagador. Limite aberto para o sacado âncora, que oferece prazos estendidos a fornecedores e antecipação de recebíveis.",
  },
  {
    title: "Capital de giro para produção",
    desc: "Pagamento à vista ao fornecedor com prazo estendido para sua empresa. Competitividade e preços especiais na compra de insumos.",
  },
  {
    title: "Serviços de Trustee",
    desc: "Gestão e administração dos fluxos de recebimentos e pagamentos. Mais controle, transparência e previsibilidade para o caixa.",
  },
  {
    title: "Consultoria e gestão financeira",
    desc: "Projetos de reestruturação e melhoria de desempenho financeiro, com foco em resultados concretos e crescimento sustentável.",
  },
];

export function Fidc() {
  return (
    <div id="fidc" className="bg-[#003650] px-6 py-24 md:px-12 md:py-[110px]">
      <ScrollReveal className="mx-auto max-w-[1100px]">
        <div className="text-[11px] font-bold tracking-[4px] text-[#00B3A9]">
          FIDC · CARRO-CHEFE
        </div>
        <div className="my-5 h-0.5 w-12 bg-[#00B3A9]" />
        <h2 className="max-w-[640px] font-serif text-4xl font-normal leading-[1.12] text-white md:text-[46px]">
          Crédito estruturado via FIDC para gerar caixa imediato.
        </h2>
        <p className="mt-6 max-w-[560px] text-[15px] font-light leading-[1.8] text-white/60">
          Antecipação de recebíveis e operações estruturadas com flexibilidade,
          agilidade e taxas competitivas frente ao mercado.
        </p>
        <div className="mt-14 grid grid-cols-1 gap-px border border-white/[0.12] bg-white/[0.12] md:grid-cols-2">
          {ITEMS.map((item) => (
            <div key={item.title} className="bg-[#003650] px-8 py-9">
              <div className="font-serif text-2xl text-[#00B3A9]">{item.title}</div>
              <div className="mt-3 text-[13px] leading-[1.7] text-white/65">
                {item.desc}
              </div>
            </div>
          ))}
        </div>
      </ScrollReveal>
    </div>
  );
}
