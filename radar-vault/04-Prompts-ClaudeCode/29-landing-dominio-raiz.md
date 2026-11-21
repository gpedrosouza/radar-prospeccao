# Prompt 29 — Landing Page institucional no domínio raiz

> Fase: Pós-MVP — Roadmap de crescimento (agendamento + analytics)
> Pré-requisito: MVP completo (prompt 28 concluído)
> Próximo prompt do plano: `30-agendamento-google-calendar.md`

---

## Contexto para quem for rodar este prompt

A landing page institucional da GR existe hoje como um protótipo separado (formato `.dc.html`,
gerado por uma ferramenta de design/prototipagem — tags `x-dc`, `sc-for`, `sc-if`, bindings
`{{ }}`). Ela foi copiada para `docs/design/landing-origem/` neste repositório **só como
referência visual e de conteúdo** — não é código de produção e não deve ser importada ou
executada como está. O trabalho deste prompt é reimplementar essa página como JSX real dentro
de `apps/web`, servindo na rota raiz (`/`), que hoje só existe como um redirect condicional
para `/login` ou `/mapa`.

---

## Prompt

```
Leia o CLAUDE.md na raiz do projeto. Leia também docs/design/landing-origem/Landing Page GR.dc.html
— é um protótipo de design (não é código de produção, ignore as tags x-dc/sc-for/sc-if e os
bindings {{ }}, mas replique fielmente o conteúdo, a estrutura de seções, as cores, a tipografia
(Montserrat + Instrument Serif via Google Fonts) e o texto de cada seção). As imagens de
referência (logo, Produtos PF, Produtos PJ) estão em docs/design/landing-origem/assets/ — copie
para apps/web/public/landing/ com os nomes apropriados antes de referenciá-las.

Objetivo: criar a landing institucional da GR Gestão Financeira como página pública em
apps/web, servindo na rota raiz do domínio (grgestaofinanceira.com.br).

## Reestruturação de rotas (fazer primeiro, com cuidado)

Hoje apps/web/src/app/page.tsx redireciona incondicionalmente para /login ou /mapa, e o grupo
de rotas (app)/ (mapa, cnpjs, exportacoes, campanhas) é protegido por auth no próprio
(app)/layout.tsx. Isso precisa mudar assim:

- app/page.tsx deixa de redirecionar sempre. Vira a landing pública. Se houver sessão ativa
  (auth() retorna user), pode mostrar um CTA "Ir para o painel" no lugar do CTA de login/agendar
  no nav, mas NÃO deve forçar redirect — um usuário logado também pode querer ver a landing.
- Not toque no middleware.ts (ele já só protege /api/*, está correto).
- Não toque na lógica de auth do (app)/layout.tsx (continua redirecionando para /login se não
  houver sessão) — só garanta que a landing em si não está dentro do grupo (app).
- O link de "Entrar" (acesso de banker/admin ao painel) deve existir em algum lugar discreto da
  landing (ex. rodapé ou canto do nav), apontando para /login.

## Estrutura de componentes

Crie apps/web/src/components/landing/ com um componente por seção, seguindo os data-screen-label
do arquivo de referência como guia de nomeação:
- Nav.tsx (sticky, com os anchors: Produtos, FIDC, Simulador, FAQ, e o CTA "Agendar Reunião")
- Hero.tsx
- Sobre.tsx
- Produtos.tsx (com as duas tabs PJ/PF — client component, useState local para a tab ativa)
- Fidc.tsx
- ComoFunciona.tsx
- Simulador.tsx (client component — useState para valor/prazo dos sliders e cálculo do
  resultado; replique a lógica de simulação que estiver implícita no protótipo de referência;
  se a fórmula de taxa/resultado não estiver clara no HTML de referência, implemente um cálculo
  razoável de simulação de crédito e sinalize isso como TODO explícito no código e no seu
  relatório final, para eu revisar os números com a área de produto antes de publicar)
- Segmentos.tsx
- Depoimentos.tsx
- Faq.tsx (client component — accordion com useState, transição suave de altura/opacidade ao
  abrir/fechar, não apenas display:none abrupto)
- CtaFinal.tsx

Todas as seções que são só texto/imagem estático (Hero, Sobre, Fidc, ComoFunciona, Segmentos,
Depoimentos, CtaFinal) devem ser Server Components — só marque "use client" nas que
efetivamente precisam de estado ou interação (Nav para scroll-spy, Produtos, Simulador, Faq).

O botão/link "Agendar Reunião" (aparece 5x no protótipo de referência: nav, hero, simulador x2,
CTA final) deve, por enquanto, apontar para "/agende" como href simples (a página /agende em si
será implementada no próximo prompt — não a construa aqui, só deixe o link pronto apontando pra
lá, sem quebrar se a rota ainda não existir).

## Animações e micro-interações

- Scroll reveal: fade + slide sutil (translateY ~16-20px, opacity 0→1, ~400ms ease-out) em cada
  seção conforme entra no viewport. Implemente com IntersectionObserver num hook próprio
  (ex. useScrollReveal) — não adicione framer-motion como nova dependência a menos que já exista
  no projeto; prefira CSS + Intersection Observer nativo para manter o bundle leve.
- Nav: scroll suave nas âncoras (já era scroll-behavior:smooth no protótipo) com destaque visual
  (cor/sublinhado) do item de menu correspondente à seção visível no momento (scroll-spy simples
  via IntersectionObserver nas seções-alvo).
- Simulador: transição suave ao trocar de tab PJ/PF e ao mover os sliders (sem esperar animação
  complexa, só evitar troca abrupta de números/estado visual).
- Faq: accordion com transição de altura/opacity, não abrir/fechar instantâneo.
- Evite parallax pesado, loops contínuos ou qualquer animação 3D — o tom da marca é sóbrio
  (institucional/financeiro), a landing de referência já reflete isso na paleta escura
  azul-petróleo (#00222f, #003650) e teal (#00B3A9).

## SEO e metadata

Adicione metadata real via Next.js Metadata API em app/page.tsx (title, description, og:image
usando o logo ou uma imagem de destaque), já que hoje a rota raiz nunca foi pensada para SEO
(era só um redirect).

## Ao final

1. Rode a landing localmente e confira visualmente cada seção comparando com
   docs/design/landing-origem/Landing Page GR.dc.html (abra ambos lado a lado).
2. Confirme que um usuário sem sessão consegue acessar "/" livremente (sem redirect para
   /login), e que "/mapa", "/cnpjs" etc. continuam exigindo login normalmente.
3. Me reporte especificamente: (a) qualquer trecho do protótipo de referência cujo conteúdo ou
   comportamento você teve que inferir por falta de clareza (especialmente a fórmula do
   simulador de crédito), e (b) o texto exato dos 5 pontos onde o link "Agendar Reunião" foi
   deixado apontando para /agende, para eu confirmar antes do próximo prompt.
```

## Após rodar este prompt

- Revisar visualmente a landing publicada em ambiente de preview antes de apontar o domínio raiz de produção para ela.
- Validar com a área de produto a fórmula/os números exibidos no simulador de crédito antes de publicar — isso é conteúdo financeiro voltado ao público, não pode ficar com placeholder.
- Seguir para `30-agendamento-google-calendar.md` (rota `/agende`, Calendar API, `ScheduledMeeting`) — os 5 links já estarão prontos esperando essa rota existir.
- Considerar registrar a decisão de reestruturação de rotas (`/` pública vs. grupo `(app)` autenticado) como ADR curto em `radar-vault/05-Decisoes-ADR/`, já que muda uma premissa do projeto original (antes tudo exigia login).
