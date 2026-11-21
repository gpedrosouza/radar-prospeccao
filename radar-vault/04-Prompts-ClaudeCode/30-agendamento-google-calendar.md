# Prompt 30 — Agendamento de reunião via Google Calendar API

> Fase: Pós-MVP — Roadmap de crescimento (agendamento + analytics)
> Pré-requisito: `29-landing-dominio-raiz.md` concluído (os 5 links "Agendar Reunião" já
> apontam para `/agende`)
> Próximo prompt do plano: `31-analytics-eventos-funil.md`

---

## Contexto para quem for rodar este prompt

Precisamos de uma página pública de agendamento (`/agende`), estilizada como a GR, que sirva
dois públicos ao mesmo tempo: quem clica em "Agendar Reunião" na landing institucional
(`grgestaofinanceira.com.br`) e quem clica no link de agendamento dentro de um e-mail de
campanha (fluxo já existente em `EmailCampaign`/`EmailRecipient`). É a mesma rota nos dois
casos — a origem é só um parâmetro de query, não uma página separada.

O motivo de usar a Calendar API em vez do agendamento nativo do Google Workspace é que o plano
atual do Workspace (básico) não libera "Calendar appointment schedules" — mas a API em si é
gratuita para este volume de uso (ver decisão registrada abaixo).

**Decisão já tomada, não rediscutir sem motivo novo:** autenticação via Service Account com
domain-wide delegation, impersonando um calendário dedicado (ex.
`agenda@grgestaofinanceira.com.br`), sem OAuth interativo por lead. Custo da API: gratuito
dentro dos limites de quota (10.000 req/min por projeto, teto de 1.000.000 req/dia) — volume de
uma campanha de leads fica ordens de grandeza abaixo disso.

**Sobre o design da página /agende:** assim como a landing, o layout desta página é produzido
separadamente no Claude Design (Fable 5) a partir do prompt
`radar-vault/07-Prompts-ClaudeDesign/01-pagina-agendamento.md`, e o resultado é copiado para
`docs/design/agende-origem/` neste repositório antes de rodar o prompt abaixo (mesmo fluxo já
usado com `docs/design/landing-origem/` no prompt 29). **Não rode este prompt 30 até que
`docs/design/agende-origem/` exista** — a seção 5 abaixo depende diretamente desse material.

---

## Prompt

```
Leia o CLAUDE.md na raiz do projeto. Leia também apps/web/src/app/api/campaigns/route.ts e
apps/web/src/server/services/email-campaign.service.ts como referência de padrão a seguir
(rota fina → service com a lógica de negócio → repository com o acesso a dados via Prisma).
Leia também packages/db/prisma/schema.prisma para entender as convenções de modelagem já
usadas (nomes de tabela em snake_case via @@map, campos em snake_case, uuid como PK).

Leia docs/design/agende-origem/ — é o design de referência da página /agende, produzido no
Claude Design (mesmo fluxo já usado para a landing em docs/design/landing-origem/, ver prompt
29). Se o arquivo estiver no mesmo formato de protótipo (.dc.html com tags x-dc/sc-for/sc-if e
bindings {{ }}), trate-o só como referência visual e de estrutura de conteúdo — não é código de
produção, ignore as tags do protótipo e replique fielmente layout, textos, estados (formulário,
seleção de data/hora, confirmação, erro de horário indisponível) e o estilo visual (cores,
tipografia, espaçamento). Se docs/design/agende-origem/ não existir ainda, PARE e me avise —
não invente o layout, o design já foi feito separadamente.

Objetivo: implementar o fluxo de agendamento de reunião via Google Calendar API, exposto como
página pública /agende, reutilizável tanto pela landing institucional quanto pelos e-mails de
campanha.

## 1. Schema Prisma — novo modelo ScheduledMeeting

Adicione ao schema.prisma (rodar via prisma migrate dev normalmente — esta tabela NÃO é
particionada, não precisa de migration manual como company_cnpj):

model ScheduledMeeting {
  id                 String    @id @default(uuid()) @db.Uuid
  nome_lead          String
  email_lead         String
  telefone_lead       String?
  /// "landing" ou "email" — de onde veio o clique em Agendar Reunião.
  origem             String
  /// Preenchido quando origem = "email" e o clique veio de um link de campanha.
  campaign_id_origem String?   @db.Uuid
  /// Cookie de sessão anônima do visitante — mesmo gr_session usado no pipeline de
  /// analytics (prompt 31), permite correlacionar clique → agendamento sem duplicar tracking.
  session_id         String?
  inicio             DateTime
  fim                DateTime
  /// ID do evento retornado pela Calendar API — usado para cancelar/reagendar depois.
  google_event_id    String
  google_meet_link   String?
  status             String    @default("confirmado") // confirmado | cancelado
  criado_em          DateTime  @default(now())

  campanha_origem EmailCampaign? @relation(fields: [campaign_id_origem], references: [id], onDelete: SetNull)

  @@index([email_lead])
  @@index([origem])
  @@index([inicio])
  @@map("scheduled_meetings")
}

Adicione também o lado inverso da relação em EmailCampaign (scheduled_meetings
ScheduledMeeting[]).

## 2. Variáveis de ambiente

Adicione ao .env.example e apps/web/.env.local.example, seguindo o padrão de comentário já
usado nas seções de GOOGLE_PLACES_API_KEY e RESEND_API_KEY:

# Service Account com domain-wide delegation para a Calendar API — usada para consultar
# disponibilidade e criar eventos no calendário de agendamento da GR sem OAuth por lead.
# Criar em console.cloud.google.com > IAM & Admin > Service Accounts, habilitar domain-wide
# delegation no Admin Console do Workspace, escopo:
# https://www.googleapis.com/auth/calendar
# GOOGLE_SCHEDULING_SA_EMAIL=
# GOOGLE_SCHEDULING_SA_PRIVATE_KEY=
# GOOGLE_SCHEDULING_CALENDAR_ID=agenda@grgestaofinanceira.com.br
# GOOGLE_SCHEDULING_IMPERSONATE_EMAIL=agenda@grgestaofinanceira.com.br

# Regras de negócio do agendamento (não vêm da API do Google, são definidas por nós)
# SCHEDULING_MEETING_DURATION_MINUTES=30
# SCHEDULING_BUFFER_MINUTES=15
# SCHEDULING_MIN_NOTICE_HOURS=4
# SCHEDULING_BUSINESS_HOURS_START=09:00
# SCHEDULING_BUSINESS_HOURS_END=18:00

Use googleapis (adicionar dependência em apps/web/package.json) para o client da Calendar API.

## 3. Camada de service/repository

apps/web/src/server/repositories/scheduled-meeting.repository.ts
- createMeeting(data), findByEmail(email), cancelMeeting(id) — Prisma puro, sem lógica de
  negócio, seguindo o padrão de email-campaign.repository.ts.

apps/web/src/server/services/google-calendar-client.ts
- Encapsula a autenticação da service account (JWT client do googleapis com domain-wide
  delegation, subject = GOOGLE_SCHEDULING_IMPERSONATE_EMAIL) e expõe duas funções de baixo
  nível: getFreeBusy(dateRangeStart, dateRangeEnd) e createEvent(params). Nenhuma regra de
  negócio aqui — só a chamada crua à API.

apps/web/src/server/services/scheduling.service.ts
- getAvailableSlots(date): chama getFreeBusy, aplica as regras de negócio das env vars
  (duração, buffer, antecedência mínima, horário comercial, exclui fins de semana), devolve
  lista de slots livres.
- bookMeeting(input): REVALIDA que o slot ainda está livre (chama getFreeBusy de novo antes de
  criar — evita condição de corrida entre dois leads escolhendo o mesmo horário), chama
  createEvent com conferenceDataVersion: 1 (gera Google Meet automático) e attendees incluindo
  o e-mail do lead, persiste em ScheduledMeeting via repository, retorna o resultado. Se o slot
  não estiver mais livre na revalidação, lança um erro de domínio SlotIndisponivelError (siga o
  padrão de erros de domínio já usado em ExportConcurrentLimitError/ExportHourlyLimitError).

## 4. Rotas de API (públicas — NÃO exigem sessão, são usadas por leads não autenticados)

apps/web/src/app/api/scheduling/availability/route.ts
- GET com query param ?date=YYYY-MM-DD, chama scheduling.service.getAvailableSlots, retorna
  lista de horários livres em ISO 8601.

apps/web/src/app/api/scheduling/book/route.ts
- POST com body { nome, email, telefone?, inicio, origem, campaign_id_origem?, session_id? },
  validação básica dos campos obrigatórios (nome, email, inicio, origem), chama
  scheduling.service.bookMeeting, trata SlotIndisponivelError retornando 409 com mensagem
  clara ("Esse horário acabou de ser reservado por outra pessoa, escolha outro").

Estas duas rotas precisam ser adicionadas à lista de exceções públicas no middleware.ts (mesmo
padrão de /api/health, /api/unsubscribe, /api/webhooks/resend) — são chamadas por visitantes
sem login.

## 5. Página /agende

apps/web/src/app/agende/page.tsx (fora do grupo (app), pública). Estrutura visual e conteúdo
vêm de docs/design/agende-origem/ (ver instrução no início deste prompt) — sua tarefa aqui é
implementar a interatividade REAL por trás desse layout, não redesenhar nada. Crie os
componentes de apps/web/src/components/agendamento/ espelhando as seções que existirem no
design de referência (ex. Cabecalho.tsx, FormularioLead.tsx, SeletorData.tsx, SeletorHorario.tsx,
Confirmacao.tsx, ErroSlotIndisponivel.tsx — ajuste os nomes ao que o design de fato tiver).

Amarre os seguintes comportamentos aos elementos visuais do design, onde quer que eles estejam
posicionados no layout de referência:
1. Formulário de lead: nome, e-mail, telefone (opcional).
2. Seletor de data (próximos ~14 dias úteis) — ao escolher a data, busca
   GET /api/scheduling/availability?date=... e popula os horários livres com o componente visual
   correspondente do design (lista/grade de botões, o que o layout de referência definir).
3. Ao escolher horário e confirmar, chama POST /api/scheduling/book incluindo origem (leia da
   query string ?origem=landing ou ?origem=email&campanha_id=X que chegou na URL) e session_id
   (leia do cookie gr_session se existir — se ainda não existir porque o prompt 31 de analytics
   não rodou, envie null sem quebrar).
4. Tela/estado de confirmação mostrando data/hora escolhida e o link do Google Meet gerado
   (google_meet_link retornado pela API) — use o estado de sucesso já desenhado no design de
   referência, se houver; se o design não previu esse estado, sinalize isso no seu relatório
   final em vez de inventar um visual novo.
5. Trate o erro 409 de slot indisponível — use o estado de erro do design de referência se
   existir, senão sinalize também, e no código atualize a lista de horários automaticamente
   após o erro.

Se o design de referência não cobrir algum estado necessário (loading, erro genérico de rede,
campo obrigatório vazio), implemente o mais discreto possível seguindo a paleta/tipografia já
usada nas outras seções do mesmo design, e liste isso no relatório final para revisão.

## Ao final

1. Rode os testes existentes para garantir que nada quebrou (npm test --workspace=apps/web).
2. Escreva testes Vitest para scheduling.service.ts cobrindo: geração de slots respeitando
   horário comercial/antecedência mínima, e o caminho de SlotIndisponivelError na revalidação
   (mocke o cliente da Calendar API, não chame o Google de verdade nos testes — siga o padrão
   de mock já usado em email-campaign.service.test.ts).
3. Me reporte: (a) se a etapa de habilitar domain-wide delegation no Admin Console do Workspace
   ficou clara o suficiente para eu fazer manualmente (isso não dá pra automatizar por código,
   é configuração no console do Google), e (b) qualquer decisão de regra de negócio que você
   teve que assumir (ex. o que fazer se o lead tentar agendar em cima de um horário já com
   buffer insuficiente) para eu validar.
```

## Após rodar este prompt

- **Configuração manual fora do código, feita por você**: criar a Service Account no
  console.cloud.google.com, habilitar domain-wide delegation no Admin Console do Workspace
  (Segurança > Controles de API > Delegação em todo o domínio), autorizar o escopo
  `https://www.googleapis.com/auth/calendar`, e preencher as variáveis de ambiente reais
  (`GOOGLE_SCHEDULING_SA_EMAIL`, `GOOGLE_SCHEDULING_SA_PRIVATE_KEY` etc.) — nenhum prompt de
  código resolve essa parte.
- Testar o fluxo ponta a ponta manualmente: agendar um horário de teste e confirmar que o
  evento aparece no calendário real com o Google Meet anexado.
- Validar as regras de negócio (duração, buffer, antecedência mínima) com quem vai efetivamente
  atender as reuniões antes de divulgar o link na campanha.
- Seguir para `31-analytics-eventos-funil.md` — o `session_id`/`gr_session` já está previsto
  como campo em `ScheduledMeeting`, então o pipeline de eventos só precisa gerar e propagar
  esse cookie.
