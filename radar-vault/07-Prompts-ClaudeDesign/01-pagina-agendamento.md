# Prompt para Claude Design (Fable 5) — Página de Agendamento de Reunião

> Este prompt NÃO é para o Claude Code. É para colar diretamente no Claude Design.
> Depois de gerado, salve o resultado (arquivo `.dc.html` + assets, mesmo formato usado para a
> landing) em `docs/design/agende-origem/` neste repositório, antes de rodar
> `04-Prompts-ClaudeCode/30-agendamento-google-calendar.md`.

---

## Contexto para você (antes de colar no Claude Design)

Esta página é o destino do botão "Agendar Reunião" que já existe em 5 pontos da landing
institucional da GR (nav, hero, simulador x2, CTA final), e também é o link enviado nos e-mails
da campanha de prospecção. Ou seja: a mesma página atende quem chega pelo site e quem chega por
e-mail — o design deve funcionar bem para as duas origens sem precisar de duas versões.

A referência visual obrigatória é a landing já existente
(`docs/design/landing-origem/Landing Page GR.dc.html`) — copie a paleta, tipografia e tom exatos
de lá, não crie uma identidade nova. Isso já está registrado como decisão de marca no projeto
(navy `#003650`/`#00222f` + teal `#00B3A9`, Montserrat + Instrument Serif — ver
`radar-vault/05-Decisoes-ADR/ADR-005-Identidade-Visual-GR.md`).

---

## Prompt (colar no Claude Design)

```
Crie o design de uma página de agendamento de reunião para a GR Gestão Financeira, seguindo
EXATAMENTE o mesmo stack visual da landing page institucional da GR que estou anexando/colando
como referência: fundo escuro navy (#00222f / #003650 em gradiente), acento teal (#00B3A9),
tipografia Montserrat para textos e Instrument Serif (itálico/serifada) para títulos de
destaque, mesmo estilo de botões (bordas retas, padding generoso, hover em teal), mesmo padrão
de espaçamento generoso entre seções e o mesmo logo GR.

O objetivo da página: um lead (pessoa física ou empresa) que já conhece a GR pela landing ou
recebeu um e-mail de campanha chega aqui para marcar uma reunião de diagnóstico financeiro
gratuito com um assessor. A página precisa ser objetiva — o lead já está convencido, não precisa
de muito conteúdo de venda aqui, só confiança e facilidade para marcar o horário.

Estrutura de seções necessárias (numere/rotule como data-screen-label, no mesmo padrão da
landing):

1. **Cabeçalho** — logo GR (funcionando como link de volta para a home), texto curto reforçando
   valor: algo como "Agende seu diagnóstico financeiro gratuito com um assessor GR" + uma
   subfrase de confiança (ex. menção a resposta rápida, sem compromisso, 30 minutos).

2. **Formulário de dados do lead** — campos: Nome, E-mail, Telefone (opcional, marcado como
   opcional visualmente). Estilo consistente com inputs que a landing já usa no simulador
   (fundo claro sobre o dark theme, ou o padrão que fizer mais sentido visualmente).

3. **Seleção de data** — um seletor dos próximos ~14 dias úteis (pode ser uma faixa horizontal
   de cards de data, ou um mini-calendário — escolha o que for mais elegante dentro da
   identidade visual). Sem sábados/domingos.

4. **Seleção de horário** — depois de escolher a data, uma grade/lista de horários disponíveis
   como botões (ex. "09:00", "09:45", "10:30"...). Preveja também o ESTADO de "nenhum horário
   disponível nesse dia" com uma mensagem discreta sugerindo escolher outra data.

5. **Confirmação** — botão final "Confirmar Agendamento" destacado (cor teal, mesmo peso visual
   do CTA "Agendar Reunião" da landing).

6. **Tela/estado de sucesso** — depois de confirmado: mensagem de sucesso, resumo da data/hora
   escolhida, e um espaço para exibir o link da videochamada (Google Meet) que será gerado.
   Pode incluir um ícone de calendário/check, tom acolhedor mas ainda sóbrio.

7. **Estado de erro** — para o caso em que o horário escolhido acabou de ser reservado por outra
   pessoa (condição de corrida): mensagem clara tipo "Esse horário acabou de ser reservado,
   escolha outro" com destaque visual de atenção (não vermelho agressivo — algo consistente com
   o tom sóbrio da marca, ex. o mesmo laranja/amber discreto que a landing possa já usar em
   avisos, ou um teal mais escuro).

8. **Rodapé simples** — algum link discreto de contato alternativo (WhatsApp, e-mail) para quem
   preferir não usar o agendamento automático, e o aviso padrão de LGPD que a GR já usa nos
   e-mails de campanha (algo como: dados fornecidos serão usados exclusivamente para contato
   comercial, conforme LGPD).

Requisitos adicionais:
- Mobile-first de verdade: uma fração relevante dos acessos vem de clique em e-mail, aberto no
  celular — o layout de seleção de data/horário precisa funcionar bem em telas estreitas.
  Também gostaria de sugestões de animações de navegação e transições suteis entre os estados
  (formulário → seleção de horário → confirmação), no mesmo tom sóbrio da landing (nada de
  efeitos chamativos, transições curtas tipo fade/slide).
- Sem elementos de navegação principal (sem menu de "Produtos", "FIDC" etc. — esta é uma página
  de conversão isolada, com foco único em completar o agendamento).
- Gere como protótipo interativo no mesmo formato que você já usa (com os estados de
  formulário/seleção/confirmação/erro navegáveis para eu revisar cada um).
```

## Após gerar no Claude Design

1. Exportar/salvar o resultado (arquivo de protótipo + assets de imagem, se houver) em
   `docs/design/agende-origem/` neste repositório — mesma estrutura usada em
   `docs/design/landing-origem/`.
2. Revisar visualmente os 4 estados (formulário, seleção, confirmação, erro) antes de liberar
   para o prompt 30 do Claude Code.
3. Confirmar que o tom do estado de erro (horário indisponível) não ficou agressivo demais —
   isso é atrito numa etapa crítica de conversão, vale um olhar extra.
