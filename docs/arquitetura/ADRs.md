# ADRs — Architecture Decision Records
## Radar de Prospecção Geográfica — v2.0

> Os ADRs registram decisões arquiteturais importantes, o contexto em que foram tomadas e suas consequências. São imutáveis uma vez aceitos — se uma decisão mudar, cria-se um novo ADR referenciando o anterior.

---

## ADR-001 — Separação de Processos em Monorepo (apps/web vs apps/workers)

**Status:** Aceito  
**Data:** Junho/2026  
**Decisionistas:** Arquiteto de software

### Contexto

A v1 do sistema concentrava toda a lógica em um único processo Next.js: UI, rotas de API, workers de exportação, scripts de importação. Durante uso real, jobs de exportação de milhões de linhas competiam com requisições da UI pelo mesmo event loop Node.js, causando degradação perceptível na interface.

### Decisão

Separar o sistema em dois apps independentes dentro de um monorepo npm workspaces:
- `apps/web`: Next.js com UI e rotas de API finas (BFF)
- `apps/workers`: Node.js standalone para processamento pesado (exportação, e-mail, geocodificação)

Código compartilhado (tipos, Zod schemas, cliente Prisma) vai exclusivamente em `packages/`.

### Consequências

**Positivas:**
- Jobs pesados nunca afetam a responsividade da UI
- Cada processo tem ciclo de vida independente (restart, scale, crash)
- Workers podem ter diferentes configurações de recursos (CPU/memória)
- Migrar qualquer componente para serviço gerenciado no futuro é mudança de infraestrutura, não de código

**Negativas:**
- Mais complexidade operacional (2 Dockerfiles, 2 processos para monitorar)
- Lógica duplicada onde necessário (ex: `resolveMunicipioCodigos` existe em web e workers)
- Equipe precisa entender a fronteira entre os dois apps

**Regra derivada:** `apps/web` e `apps/workers` NUNCA importam um do outro. Violações são detectadas pelo ESLint (`no-restricted-imports`).

---

## ADR-002 — Particionamento do PostgreSQL por LIST(uf)

**Status:** Aceito  
**Data:** Junho/2026  
**Decisionistas:** Arquiteto de dados

### Contexto

A tabela `company_cnpj` precisa armazenar ~66 milhões de registros da Receita Federal. Sem particionamento, qualquer query sem índice adequado resulta em full scan desta tabela, tornando a aplicação inutilizável em produção.

Foram avaliadas três estratégias:
1. Tabela monolítica com índices compostos
2. RANGE partitioning por data de abertura
3. LIST partitioning por UF (estado)

### Decisão

Usar `PARTITION BY LIST (uf)` com 27 partições — uma por Unidade Federativa do Brasil.

**Justificativa:** O caso de uso primário do sistema é a busca por área geográfica, que sempre inclui filtro de UF ou conjunto de municípios de uma UF. O partition pruning do PostgreSQL descarta automaticamente as 26 partições irrelevantes quando `WHERE uf = 'SP'` está presente, reduzindo o conjunto de dados varrido em até 97%.

### Consequências

**Positivas:**
- Partition pruning elimina 96–99% dos dados em queries com filtro de UF
- Manutenção por UF isolada (VACUUM, análise de índices)
- Dados de SP (maior volume) ficam em partição separada
- Índices por partição são menores e mais eficientes

**Negativas:**
- Prisma não gerencia o DDL de tabelas particionadas — migrations manuais obrigatórias
- PK composta `(id, uf)` — o Prisma precisa de ambas as colunas para qualquer operação
- `PARTITION BY` e `BIGSERIAL` são incompatíveis — exige sequence global (`company_cnpj_id_seq`)
- `COUNT(*)` sem filtro de UF ainda faz scan nas 27 partições

**Regra derivada:** Toda query de UI em `company_cnpj` DEVE incluir `WHERE uf = ?` ou `WHERE uf IN (?)` para ativar partition pruning. Queries sem esse filtro são proibidas em código de produção.

---

## ADR-003 — BullMQ + Redis para Processamento Assíncrono

**Status:** Aceito  
**Data:** Junho/2026  
**Decisionistas:** Arquiteto de software

### Contexto

Jobs de exportação podem demorar de segundos a minutos, dependendo do volume de dados. Na v1, exportações eram síncronas (o usuário ficava esperando a response HTTP), causando timeouts em volumes maiores e travamento da conexão do browser.

Foram avaliadas três abordagens:
1. Processamento síncrono (mantém v1) — descartado por timeout
2. Tabela de jobs com polling (o worker faz SELECT periodicamente) — solução simples mas gera load no banco
3. Fila em memória com Redis (BullMQ) — padrão da indústria para processamento assíncrono

### Decisão

Usar BullMQ com Redis como backend de filas.

**Justificativa:** BullMQ oferece retries com backoff, concorrência configurável, visibilidade de estado via Redis e desacoplamento completo entre producer (web) e consumer (workers). O Redis já seria necessário para rate limiting, tornando o custo marginal de adicionar filas próximo de zero.

A tabela `cnpj_export_jobs` no Postgres serve como trilha de auditoria permanente — o Redis pode ser limpo sem perder histórico.

### Consequências

**Positivas:**
- UI responde imediatamente (201 com jobId) — zero timeout
- Retries automáticos com backoff exponencial (3 tentativas, 5s inicial)
- Concorrência controlada por configuração (não por código)
- Visibilidade de estado para debugging via Redis CLI

**Negativas:**
- Dependência adicional (Redis deve estar sempre disponível)
- Estado duplicado: Redis (runtime) + Postgres (auditoria)
- Desenvolvimento local requer Redis rodando (mitigado pelo Docker Compose)

**Regra derivada:** Jobs longos (exportação, geocodificação, campanhas de e-mail) SEMPRE via fila BullMQ. Nunca processamento síncrono em rota de API.

---

## ADR-004 — Cloudflare R2 para Armazenamento de Exportações

**Status:** Aceito  
**Data:** Junho/2026  
**Decisionistas:** Arquiteto de infraestrutura

### Contexto

Arquivos de exportação podem ter centenas de MB (66M CNPJs → CSV comprimido ~3–5 GB no pior caso). Armazenar em disco local do container é inviável: containers são stateless, o disco seria consumido rapidamente e o acesso ao arquivo dependeria de qual container respondeu.

Foram avaliadas:
1. Disco local do container — descartado (stateless, sem HA)
2. Volume Docker montado na VPS — possível mas limita escala horizontal
3. AWS S3 — funcional mas com custo de egress significativo
4. Cloudflare R2 — compatível com S3 SDK, **zero taxa de egress**

### Decisão

Usar Cloudflare R2 em produção, MinIO (compatível com S3) em desenvolvimento local.

**Justificativa:** R2 oferece a mesma API do S3 (sem alteração de código ao migrar) e egress gratuito — crítico pois bankers baixam CSVs com frequência. O código usa `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner`, compatível com ambos.

### Consequências

**Positivas:**
- Zero custo de egress (vs. S3 que cobra por GB transferido)
- 10 GB de armazenamento gratuito (mais que suficiente para MVP)
- URLs pré-assinadas não exigem autenticação na CDN — download direto pelo browser
- Containers stateless podem reiniciar sem perder arquivos

**Negativas:**
- Dependência de serviço externo (R2 indisponível → downloads indisponíveis)
- Configuração de R2 exige conta Cloudflare + bucket + credenciais

**Configuração local:** MinIO rodando no Docker Compose com bucket `radar-exports` inicializado automaticamente pelo container `minio-init`.

---

## ADR-005 — Server-Sent Events (SSE) para Progresso de Exportação

**Status:** Aceito  
**Data:** Junho/2026  
**Decisionistas:** Engenheiro frontend

### Contexto

O usuário precisa de feedback de progresso durante exportações longas. Foram avaliadas:
1. Polling periódico do frontend (GET /api/cnpj/export-jobs/{id} a cada N segundos)
2. WebSocket bidirecional
3. Server-Sent Events (SSE) — canal unidirecional servidor → cliente

### Decisão

Usar SSE com polling interno no servidor (não no frontend).

**Implementação:** Uma única rota `/api/cnpj/export-jobs/{id}/stream` mantém a conexão SSE aberta e faz polling ao banco a cada 1,5 segundos. Emite evento SSE apenas quando status ou progresso_pct mudam.

**Justificativa:**
- SSE é mais simples que WebSocket para canal unidirecional
- O frontend faz UMA conexão (vs. N requisições em polling do cliente)
- Suporte nativo em todos os browsers modernos via `EventSource`
- Compatível com reverse proxy Caddy sem configuração adicional (`X-Accel-Buffering: no`)

### Consequências

**Positivas:**
- UI recebe updates em tempo real sem reload
- Um único polling interno substitui N requisições do cliente
- Reconexão automática pelo browser em caso de queda

**Negativas:**
- Polling interno ao banco a 1,5s × N conexões simultâneas = load proporcional ao número de exportações ativas (mitigável com pub/sub Redis no futuro)
- Em escala horizontal (múltiplas instâncias de web), a instância que abriu o SSE pode não ser a mesma que recebeu o update do worker — polling ao banco resolve isso mas é menos eficiente

**Evolução planejada:** Para múltiplas instâncias de `apps/web`, substituir o polling por pub/sub Redis — o worker publica `redis.publish('export:progress:{jobId}', payload)` e o handler SSE subscreve. BullMQ já usa Redis, sem dependência nova.

---

## ADR-006 — Contagem com Teto (countByFiltersCapped)

**Status:** Aceito  
**Data:** Junho/2026  
**Decisionistas:** Engenheiro de backend

### Contexto

A UI precisa exibir quantas empresas correspondem aos filtros aplicados. Um `COUNT(*)` direto em `company_cnpj` sem filtro de UF pode escanear as 27 partições e levar 5–30 segundos — inaceitável para uma resposta síncrona da UI.

Foram avaliadas:
1. `COUNT(*)` exato — descartado por latência em queries sem filtro forte
2. Estimativa via `pg_stat_user_tables.n_live_tup` — impreciso com múltiplos filtros AND
3. `EXPLAIN` para estimativa de rows — confiabilidade baixa sem `ANALYZE` recente
4. Contagem com teto usando `findMany({ take: cap+1, select: { id, uf } })` — escolhida

### Decisão

Usar `findMany({ take: cap+1, select: { id, uf } })` com cap padrão de 10.000.

**Justificativa:** Esta abordagem reutiliza o mesmo `buildWhere` do Prisma (incluindo partition pruning por `uf`) sem duplicar as cláusulas WHERE em SQL raw. Se há mais de 10.000 resultados, retorna `{ count: 10000, exact: false }`. O custo é ler no máximo 10.001 IDs (colunas mínimas), não dados completos.

### Consequências

**Positivas:**
- Reutiliza lógica de filtros existente (sem duplicação de SQL)
- Partition pruning ativo quando `uf` está no filtro
- Latência previsível e controlada

**Negativas:**
- Leitura de até 10.001 linhas em vez de uma operação COUNT agregada
- Contagem imprecisa acima do teto (usuário vê "mais de 10.000")

**UX:** A tela exibe "Mais de 10.000 empresas encontradas — refine os filtros para ver o total exato."

---

## ADR-007 — Autenticação com Auth.js v5 (next-auth) + Split Config

**Status:** Aceito  
**Data:** Junho/2026  
**Decisionistas:** Engenheiro de segurança

### Contexto

O Next.js 15 com App Router executa middleware no Edge Runtime, que não suporta módulos Node.js nativos (como `@node-rs/argon2` para hash de senha). Auth.js v5 exige que toda a configuração esteja num único arquivo — incompatível com essa restrição.

### Decisão

Dividir a configuração em dois arquivos:
- `auth.config.ts`: configuração edge-safe (sem argon2) — usada pelo middleware
- `auth.ts`: configuração completa (com argon2 no `authorize`) — usada por Server Actions e Route Handlers

**Configuração de `next.config.ts`:**
```ts
serverExternalPackages: ['@node-rs/argon2']
```

### Consequências

**Positivas:**
- argon2id (mais seguro que bcrypt) funciona em ambiente Node.js
- Middleware Edge continua leve e rápido
- Compatibilidade com futuras deployments em plataformas serverless edge

**Negativas:**
- Dois arquivos de configuração que precisam ser mantidos em sincronia
- Desenvolvedores precisam saber qual importar onde

---

## ADR-008 — Verificação SVIX para Webhooks Resend

**Status:** Aceito  
**Data:** Junho/2026  
**Decisionistas:** Engenheiro de segurança

### Contexto

O endpoint `/api/webhooks/resend` é público (sem autenticação de usuário) — qualquer pessoa que conhece a URL poderia enviar eventos falsos. O Resend usa SVIX para assinar todos os webhooks.

### Decisão

Verificar a assinatura SVIX em TODA requisição ao endpoint, antes de processar qualquer dado:

```
to_sign = "{svix-id}.{svix-timestamp}.{rawBody}"
secret = base64_decode(RESEND_WEBHOOK_SECRET.replace("whsec_", ""))
expected = "v1," + base64(HMAC-SHA256(secret, to_sign))
```

Proteção anti-replay: rejeitar timestamps com diferença > 5 minutos.
Comparação de constante de tempo: `timingSafeEqual()` para prevenir timing attacks.

### Consequências

**Positivas:**
- Previne injeção de eventos falsos (bounce fraudulento, complaint forjado)
- Resistente a timing attacks
- Proteção anti-replay via janela de 5 minutos

**Negativas:**
- Lê o body como texto (antes de parsear JSON) — overhead mínimo mas necessário
- Se `RESEND_WEBHOOK_SECRET` estiver incorreto, todos os webhooks são rejeitados (monitorar)

---

## ADR-009 — Token HMAC para Descadastro (RFC 8058)

**Status:** Aceito  
**Data:** Junho/2026  
**Decisionistas:** Engenheiro de software

### Contexto

O link de descadastro precisa ser não-adivinhável (não pode ser simplesmente `?email=usuario@empresa.com`), mas também não requer um banco de dados de tokens pré-gerados.

### Decisão

Usar HMAC-SHA256 com segredo dedicado (`UNSUBSCRIBE_TOKEN_SECRET`) e o e-mail + campaign_id como payload:

```ts
// packages/shared/src/server.ts
createHmac('sha256', secret)
  .update(`${email}:${campaignId}`)
  .digest('hex')
```

O token é verificado recalculando o HMAC e comparando com `timingSafeEqual`. Não é armazenado em banco.

### Consequências

**Positivas:**
- Stateless — não requer tabela de tokens
- Não adivinhável sem o segredo
- Validação O(1) sem acesso ao banco

**Negativas:**
- Token não expira — válido indefinidamente para o mesmo e-mail+campanha
- Se `UNSUBSCRIBE_TOKEN_SECRET` vazar, todos os tokens históricos ficam comprometidos (rotacionar o segredo invalida tokens existentes)

---

*Fim dos ADRs. Novos ADRs devem ser numerados sequencialmente e adicionados a este arquivo.*
