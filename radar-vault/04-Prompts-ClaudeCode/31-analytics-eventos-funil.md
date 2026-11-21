# Prompt 31 — Pipeline de eventos e funil de conversão (landing + agendamento)

> Fase: Pós-MVP — Roadmap de crescimento (agendamento + analytics)
> Pré-requisito: `30-agendamento-google-calendar.md` concluído (rota `/agende`,
> `ScheduledMeeting` com campo `session_id` já existente)
> Último prompt planejado deste ciclo pós-MVP

---

## Contexto para quem for rodar este prompt

Precisamos entender o comportamento de quem visita a landing institucional e a página de
agendamento: quantas visitas viram interação com o simulador, quantos cliques em "Agendar
Reunião" não viram agendamento concluído, quem nunca tentou nenhum meio de contato, etc. — dados
para decisões de melhoria, não para expor na própria landing.

**Decisão já tomada, não rediscutir sem motivo novo:** rastreamento first-party e anônimo, sem
Google Analytics/GTM de terceiro — cookie `gr_session` (UUID, sem PII) gerado no primeiro
acesso. Justificativa: a GR lida com dados financeiros sensíveis, manter o rastreamento em
infraestrutura própria é mais simples de justificar do ponto de vista de LGPD do que depender de
um pixel de terceiro. Isso já é referenciado como pendente em `packages/db/prisma/schema.prisma`
(`ScheduledMeeting.session_id`) e no aviso fixo de LGPD que já existe nas telas de campanha.

**Este prompt segue o MESMO padrão arquitetural já usado para analytics de CNPJ** (ver
`packages/db/prisma/migrations/20260627000001_analytics_schema/migration.sql` e
`apps/workers/src/scripts/analytics/refresh.ts`): uma tabela bruta de eventos em schema
operacional, e um schema `analytics` com tabelas-resumo populadas por um script SQL rodado
manualmente/via cron em `apps/workers` — NUNCA agregação ao vivo dentro de uma rota de API.
Regra 6 do CLAUDE.md continua valendo aqui.

---

## Prompt

```
Leia o CLAUDE.md na raiz do projeto, especialmente a regra arquitetural 6 (agregações sempre via
schema analytics, nunca direto sobre tabela operacional). Leia também
packages/db/prisma/migrations/20260627000001_analytics_schema/migration.sql e
apps/workers/src/scripts/analytics/refresh.ts + refresh-cnpj-summaries.sql — este prompt deve
seguir o MESMO padrão: tabela bruta operacional + script de refresh SQL manual populando tabelas
resumo em analytics, com log em analytics.refresh_log.

Objetivo: instrumentar eventos de comportamento na landing (/) e na página de agendamento
(/agende), e construir o funil de conversão: visita → interação com simulador → clique em algum
meio de contato → clique em "Agendar Reunião" → agendamento concluído.

## 1. Tabela bruta de eventos (schema operacional, via Prisma normal — não particionada)

Adicione ao schema.prisma:

model LandingEvent {
  id            BigInt   @id @default(autoincrement())
  session_id    String
  /// page_view | simulador_interacao | contato_click | cta_agendar_click | agendamento_concluido
  tipo_evento   String
  /// Caminho onde o evento ocorreu: "/" ou "/agende"
  path          String
  /// Dados livres do evento — ex. { "secao": "simulador", "sub_tipo": "whatsapp" }
  metadata      Json?
  origem        String?  // landing | email — replicando a mesma semântica de ScheduledMeeting.origem
  campaign_id   String?  @db.Uuid
  criado_em     DateTime @default(now())

  @@index([session_id])
  @@index([tipo_evento])
  @@index([criado_em])
  @@map("landing_events")
}

Não crie relação/FK com EmailCampaign aqui (mesma decisão já tomada em EmailRecipient — snapshot
solto, sem acoplar tabela de altíssimo volume de escrita a uma FK que exigiria lock). Correlação
com campaign_id é feita por JOIN quando necessário, não por constraint.

## 2. Cookie de sessão anônima

Crie apps/web/src/server/lib/session-cookie.ts com uma função getOrCreateSessionId() que:
- Lê o cookie gr_session da requisição (via cookies() do Next.js).
- Se não existir, gera um UUID novo e o define como cookie httpOnly=false (precisa ser lido no
  client para ser enviado em fetch/sendBeacon), Secure, SameSite=Lax, expiração de 180 dias.
- Retorna o valor (existente ou recém-criado).

Esse mesmo session_id deve ser o valor enviado como session_id no POST /api/scheduling/book
implementado no prompt 30 — se aquele código ainda estiver enviando null fixo, atualize para ler
o cookie gr_session real.

## 3. Rota de ingestão de eventos

apps/web/src/app/api/analytics/event/route.ts — POST, pública (adicionar à lista de exceções do
middleware.ts junto de /api/health, /api/scheduling/*).

Body esperado: { tipo_evento, path, metadata?, origem?, campaign_id? }. session_id NÃO vem no
body — é lido do cookie gr_session no server (evita spoofing trivial de sessão pelo client).

Validação simples: tipo_evento precisa estar numa lista fixa permitida (mesmos 5 valores do
comentário do model). Rejeitar qualquer coisa fora disso com 422 — é uma rota pública, não
queremos virar sumidouro de lixo arbitrário.

Rate limit leve por IP usando o redis-client já existente (apps/web/src/server/lib/redis-client.ts),
seguindo o mesmo padrão INCR+TTL já usado no rate limiting de export-jobs — limite generoso (ex.
60 eventos/minuto por IP), é só para conter abuso óbvio, não para ser preciso.

Grave via um scheduling.repository-like: crie
apps/web/src/server/repositories/landing-event.repository.ts com createEvent(data) — Prisma
puro, insert simples, sem lógica.

## 4. Instrumentação no client

Crie apps/web/src/lib/track-event.ts (client-side, "use client" implícito por rodar no browser):
- trackEvent(tipoEvento, path, metadata?, origem?, campaignId?) — dispara
  navigator.sendBeacon("/api/analytics/event", ...) quando disponível, com fallback para
  fetch(..., { keepalive: true }). Não deve nunca lançar erro que quebre a UI — falha de
  tracking é engolida silenciosamente (console.warn no máximo).

Instrumente, sem exagerar em volume de eventos:
- page_view: uma vez por carregamento de página, em app/page.tsx (landing) e app/agende/page.tsx.
  Inclua origem e campaign_id lidos da query string quando presentes.
- simulador_interacao: no componente Simulador.tsx da landing (criado no prompt 29), dispare UMA
  vez por sessão de uso (ex. no primeiro onChange do slider ou troca de tab — não a cada pixel
  movido do slider; debounce ou flag local para não floodar).
- contato_click: nos links/botões de WhatsApp e "responder por e-mail" da landing (metadata:
  { canal: "whatsapp" | "email" }).
- cta_agendar_click: nos 5 pontos onde "Agendar Reunião" aparece na landing (metadata:
  { secao: "nav" | "hero" | "simulador" | "cta_final" }), disparado ANTES de navegar para /agende
  (não depois — senão nunca dispara).
- agendamento_concluido: dentro do fluxo de sucesso em /agende, logo após o POST
  /api/scheduling/book retornar sucesso. Inclua o mesmo origem/campaign_id da URL.

## 5. Schema analytics — tabelas resumo do funil

Nova migration SQL manual em packages/db/prisma/migrations/ (seguindo o padrão exato da
migration 20260627000001_analytics_schema — CREATE TABLE direto, sem passar por prisma migrate
dev, já que estamos adicionando a um schema não gerenciado pelo Prisma como model):

CREATE TABLE analytics.landing_funnel_diario (
    dia                        DATE      NOT NULL,
    origem                     TEXT      NOT NULL,  -- landing | email | (all)
    total_visitas              BIGINT    NOT NULL DEFAULT 0,
    total_interacao_simulador  BIGINT    NOT NULL DEFAULT 0,
    total_clique_contato       BIGINT    NOT NULL DEFAULT 0,
    total_clique_agendar       BIGINT    NOT NULL DEFAULT 0,
    total_agendamento_concluido BIGINT   NOT NULL DEFAULT 0,
    atualizado_em              TIMESTAMP NOT NULL,
    CONSTRAINT landing_funnel_diario_pkey PRIMARY KEY (dia, origem)
);

CREATE TABLE analytics.landing_sessoes_sem_conversao (
    dia                    DATE      NOT NULL,
    /// sessões que clicaram em agendar mas não têm agendamento_concluido correspondente
    total_agendar_sem_concluir BIGINT NOT NULL DEFAULT 0,
    /// sessões com page_view mas sem NENHUM outro evento na mesma sessão
    total_visita_sem_interacao BIGINT NOT NULL DEFAULT 0,
    atualizado_em          TIMESTAMP NOT NULL,
    CONSTRAINT landing_sessoes_sem_conversao_pkey PRIMARY KEY (dia)
);

Adicione as duas ao CREATE SCHEMA IF NOT EXISTS analytics existente (idempotente, use IF NOT
EXISTS também nas CREATE TABLE já que o schema já existe de uma migration anterior).

## 6. Script de refresh (apps/workers)

Crie apps/workers/src/scripts/analytics/refresh-landing-funnel.sql, no mesmo estilo de
refresh-cnpj-summaries.sql (bloco DO $$ por tabela, TRUNCATE + INSERT, log em
analytics.refresh_log, RAISE NOTICE com contagem e tempo):

- landing_funnel_diario: agrupa landing_events por DATE(criado_em) e origem, contando
  DISTINCT session_id por tipo_evento (não COUNT(*) puro — uma sessão que clicou 3x no simulador
  conta como 1 sessão convertida no funil, não 3).
- landing_sessoes_sem_conversao: usa uma CTE ou subquery para sessões com cta_agendar_click sem
  agendamento_concluido no mesmo session_id, e sessões com page_view sem nenhum outro tipo_evento
  na mesma session_id.

Atualize apps/workers/src/scripts/analytics/refresh.ts para também executar
refresh-landing-funnel.sql e mostrar as duas novas tabelas (mesma função showTable já existente,
generalize se precisar).

NÃO crie nenhum endpoint de API que rode esse refresh sob demanda — é sempre execução manual via
npm run analytics:refresh --workspace=apps/workers, exatamente como já documentado no cabeçalho
do SQL de CNPJ.

## 7. Painel /dashboard/campanha-analytics (dentro do grupo autenticado)

apps/web/src/app/(app)/campanha-analytics/page.tsx (adicione a entrada correspondente na
Sidebar, apps/web/src/components/layout/Sidebar.tsx, seguindo o padrão visual já usado para
Mapa/CNPJs/Exportações/Campanhas).

Busca os dados via uma rota GET /api/analytics/landing-funnel (lê analytics.landing_funnel_diario
e analytics.landing_sessoes_sem_conversao via Prisma raw query ou $queryRaw — essas tabelas não
precisam virar models Prisma completos se for mais simples usar $queryRaw tipado).

Exibe:
- Funil visual (visitas → simulador → contato → agendar → concluído) com taxas de conversão
  entre cada etapa, filtrável por período e por origem (landing vs. email).
- Card de destaque: "X sessões clicaram em Agendar Reunião mas não concluíram" e "Y sessões
  visitaram sem nenhuma interação" — os dois números que motivaram este prompt.
- Nota visível de quando os dados foram atualizados pela última vez (lida de
  analytics.refresh_log), já que o refresh é manual/agendado, não em tempo real — evite dar a
  impressão de dado ao vivo.

## Ao final

1. Rode npm test --workspace=apps/web garantindo que nada quebrou.
2. Rode o refresh manualmente contra o banco local após gerar alguns eventos de teste
   (navegando pela landing localmente) e confirme que as tabelas analytics populam como esperado.
3. Me reporte: (a) se o volume esperado de eventos te parece compatível com escrita direta em
   landing_events sem fila (na escala de uma campanha de leads isso deve ser tranquilo, mas
   sinalize se achar que deveria passar por fila BullMQ como os outros jobs pesados do projeto),
   e (b) se a falta de índice composto (session_id, tipo_evento) te preocupa dado o padrão de
   query do refresh — avalie e ajuste se fizer sentido.
```

## Após rodar este prompt

- Definir a cadência do `analytics:refresh` para este novo SQL (diário, junto do refresh de CNPJ,
  ou mais frequente dado que decisões de campanha podem precisar de dado mais fresco) — hoje o
  refresh de CNPJ é manual, aqui pode valer configurar cron real desde já.
- Revisar com o time se `landing_sessoes_sem_conversao` deveria também segmentar por origem
  (landing vs. email) — deixei agregado no total nesta primeira versão para simplificar, é um
  ajuste pequeno se vocês quiserem esse corte.
- Considerar, depois de um tempo de dados reais, se o aviso de cookies/rastreamento na landing
  precisa de um banner de consentimento mais explícito — hoje o desenho evita dado pessoal
  (cookie anônimo), mas vale checar com jurídico se isso é suficiente para o perfil de instituição
  financeira da GR.
- Com os prompts 29, 30 e 31 concluídos, atualizar `radar-vault/03-Fases-Desenvolvimento/Status-Atual.md`
  registrando este ciclo pós-MVP como fechado.
