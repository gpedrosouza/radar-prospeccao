import { ScrollReveal } from "./ScrollReveal";

// TODO(validação): textos redigidos pela GR como sugestão de depoimento — ainda NÃO
// aprovados pelos clientes citados. Cada um precisa ser validado (ou reescrito nas
// palavras deles) e autorizado por Fabiola/Frank/Vinícius antes de publicar, já que
// atribui uma citação direta a uma pessoa real.
const DEPOIMENTOS = [
  {
    texto:
      "Já tinha meio que desistido de esperar agilidade de banco. Liguei pra GR sem muita esperança, e em poucos dias tinha uma solução na mesa, explicada num português que eu entendia de verdade. Isso muda até a forma como eu durmo à noite.",
    nome: "Fabiola",
    empresa: "Prandopel Indústria e Comércio de Papel e Embalagens",
  },
  {
    texto:
      "No nosso ramo a coleção não espera ninguém — não dá pra ficar duas semanas esperando resposta de gerente. Com a GR foi diferente: falei com gente de verdade, que entendeu a correria e resolveu rápido, sem aquele monte de burocracia de sempre.",
    nome: "Frank",
    empresa: "Koko Jeans Confecções",
  },
  {
    texto:
      "Quem trabalha com safra sabe que o dinheiro não chega quando você precisa — chega quando a terra decide. A GR foi a primeira que realmente entendeu isso e montou algo que fez sentido pro nosso calendário, não pro calendário deles.",
    nome: "Vinícius",
    empresa: "Globalnuts Indústria e Comércio de Amendoim",
  },
];

export function Depoimentos() {
  return (
    <div className="bg-[#f4f6f8] px-6 py-24 text-[#00222f] md:px-12 md:py-[110px]">
      <ScrollReveal className="mx-auto max-w-[1100px]">
        <div className="text-[11px] font-bold tracking-[4px] text-[#008f87]">
          QUEM CONFIA
        </div>
        <div className="my-5 mb-12 h-0.5 w-12 bg-[#00B3A9]" />
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {DEPOIMENTOS.map((depoimento) => (
            <div
              key={depoimento.nome}
              className="border border-[#003650]/10 bg-white px-8 py-9"
            >
              <div className="font-serif text-3xl text-[#00B3A9]">&quot;</div>
              <div className="text-sm italic leading-[1.8] text-[#445]">
                {depoimento.texto}
              </div>
              <div className="mt-5 text-xs font-bold tracking-wide text-[#003650]">
                {depoimento.nome.toUpperCase()} · {depoimento.empresa.toUpperCase()}
              </div>
            </div>
          ))}
        </div>
      </ScrollReveal>
    </div>
  );
}
