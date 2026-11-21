# Referência de Módulos e Código
## Radar de Prospecção Geográfica — v2.0

> Referência técnica detalhada de cada módulo, suas responsabilidades, entradas, saídas e exemplos de uso.

---

## packages/shared — Tipos e Schemas Compartilhados

### `src/index.ts` (browser-safe)

Tudo exportado deste arquivo é seguro para uso em browser, Edge Runtime e Node.js.

#### `CnpjSearchFiltersSchema` (Zod Schema)

Schema de validação dos filtros de busca de CNPJs. Reutilizado por:
- Rotas de API de busca e exportação (validação de input)
- Workers (validação dos filtros persistidos em `cnpj_export_jobs.filtros`)

```typescript
import { CnpjSearchFiltersSchema, type CnpjSearchFilters } from "@radar/shared";

// Valida e retorna filtros tipados
const filters: CnpjSearchFilters = CnpjSearchFiltersSchema.parse(rawInput);

// Validação com refinamentos:
// - lat, lng e raio_km devem vir todos juntos ou nenhum
// - data_abertura_de deve ser ≤ data_abertura_ate
```

**Campos disponíveis:**

| Campo | Tipo | Descrição |
|---|---|---|
| `uf` | `string (2)` | Sigla da UF — ativa partition pruning |
| `lat` | `number` | Latitude do ponto central |
| `lng` | `number` | Longitude do ponto central |
| `raio_km` | `number` | Raio em km (obrigatório com lat+lng) |
| `municipio_codigo` | `number` | Código IBGE do município (fallback) |
| `situacao` | `string` | Situação cadastral (ex: "Ativa") |
| `cnae_prefixo` | `string (1-7)` | Prefixo do CNAE (busca like) |
| `porte` | `string` | Porte da empresa |
| `matriz_filial` | `"MATRIZ" \| "FILIAL"` | Tipo do estabelecimento |
| `opcao_simples` | `boolean` | Simples Nacional |
| `opcao_mei` | `boolean` | MEI |
| `data_abertura_de` | `"YYYY-MM-DD"` | Início do intervalo de data de abertura |
| `data_abertura_ate` | `"YYYY-MM-DD"` | Fim do intervalo de data de abertura |

#### Constantes de Filas BullMQ

```typescript
import { EXPORT_QUEUE_NAME, EMAIL_CAMPAIGN_QUEUE_NAME } from "@radar/shared";

// EXPORT_QUEUE_NAME = "cnpj-export"
// EMAIL_CAMPAIGN_QUEUE_NAME = "email-campaign"
```

#### Payload Types

```typescript
import type { ExportJobPayload, EmailCampaignJobPayload } from "@radar/shared";

// ExportJobPayload: { exportJobId: string; usuarioId: string; filtros: CnpjSearchFilters }
// EmailCampaignJobPayload: { campaignId: string }
```

### `src/server.ts` (Node.js only — não importar em browser/edge)

```typescript
import { generateUnsubscribeToken } from "@radar/shared/server";

// Gera token HMAC-SHA256 para link de descadastro
const token = generateUnsubscribeToken(email, campaignId, secret);
// Uso: /api/unsubscribe?token={token}
```

---

## packages/db — Prisma Client e Tipos

### `src/index.ts`

```typescript
import { PrismaClient } from "@radar/db";
import type { FindByFiltersInput } from "@radar/db";
```

`FindByFiltersInput` é o tipo de input para queries de listagem:

```typescript
interface FindByFiltersInput {
  uf?: string;
  municipio_codigos?: number[];  // Lista de códigos IBGE
  situacao?: string;
  cnae_prefixo?: string;
  porte?: string;
  matriz_filial?: "MATRIZ" | "FILIAL";
  opcao_simples?: boolean;
  opcao_mei?: boolean;
  data_abertura_de?: string;
  data_abertura_ate?: string;
}
```

**Nota:** `municipio_codigos` (plural) é a versão resolvida de `municipio_codigo` — o service resolve o raio geográfico e expande para a lista de municípios antes de passar ao repository.

---

## apps/web/server/services

### `cnpj-search.service.ts`

Ponto de entrada para todas as buscas de CNPJ. Recebe filtros brutos (não validados), valida com Zod e resolve parâmetros geográficos.

```typescript
import { searchCnpjs, countCnpjs } from "@/server/services/cnpj-search.service";

// Busca paginada
const page = await searchCnpjs(rawFilters, { cursor: BigInt("12345"), limit: 100 });
// page.items: CnpjListItem[]
// page.nextCursor: BigInt | null

// Contagem com teto
const result = await countCnpjs(rawFilters, 10_000);
// result.count: number (máximo = cap)
// result.exact: boolean (false = há mais que o cap)
```

**Lógica de resolução de municípios (interna):**
```
Se lat + lng + raio_km fornecidos:
  → busca municípios no raio (ST_DWithin)
  → se encontrou: usa todos como municipio_codigos
  → se não encontrou + municipio_codigo fornecido: usa ele como fallback
  → se não encontrou + sem fallback: sem filtro de município (busca por UF)
Se apenas municipio_codigo fornecido:
  → usa diretamente como municipio_codigos: [municipio_codigo]
Se nenhum:
  → sem filtro de município
```

---

### `export.service.ts`

```typescript
import {
  createExportJob,
  getJob,
  getUserJobs,
  getJobDownloadUrl,
  ExportConcurrentLimitError,
  ExportHourlyLimitError,
  JobNotFoundError,
  JobAccessDeniedError,
} from "@/server/services/export.service";

// Criar job
const job = await createExportJob(userId, rawFilters);
// Lança ExportConcurrentLimitError se ≥ 5 jobs ativos
// Lança ExportHourlyLimitError se > 10 jobs na última hora

// Buscar job (com verificação de propriedade)
const job = await getJob(jobId, userId);
// Lança JobNotFoundError se não existir
// Lança JobAccessDeniedError se pertencer a outro usuário

// URL de download (gera sob demanda, TTL = 4h por padrão)
const url = await getJobDownloadUrl(jobId, userId);
```

---

### `email-campaign.service.ts`

```typescript
import {
  buildRecipientList,
  createCampaign,
  getCampaign,
  getUserCampaigns,
  CampaignNotFoundError,
  CampaignAccessDeniedError,
} from "@/server/services/email-campaign.service";

// Monta lista de destinatários (excluindo bounces e unsubscribes)
const candidates = await buildRecipientList(rawFilters);
// candidates: { cnpj, uf, email, razao_social, nome_fantasia }[]

// Criar campanha com destinatários já filtrados
const { campaign, totalDestinatarios } = await createCampaign(userId, {
  nome: "Campanha SP Q1",
  filtrosOrigem: rawFilters,
  assunto: "Proposta para {{razao_social}}",
  corpoTemplate: "Olá {{razao_social}}...",
});
```

---

### `places-search.service.ts`

```typescript
import { searchPlaces } from "@/server/services/places-search.service";

const places = await searchPlaces({ lat, lng, raioKm, keyword });
// Retorna resultados do Google Places ou do cache
// Cache key: "{lat_truncada}_{lng_truncada}_{keyword}" (precisão 0,1°)
// TTL: PLACES_CACHE_TTL_DAYS (padrão: 30)
```

**Estratégia de cache:**
O ponto geográfico é truncado para 1 casa decimal (precisão de ~11km) para criar células de grid reutilizáveis. Pesquisas próximas reutilizam o mesmo cache.

---

### `radius-search.service.ts`

```typescript
import { getRadiusCities, InvalidGeoParamsError } from "@/server/services/radius-search.service";

const cities = await getRadiusCities(lat, lng, raioKm);
// Lança InvalidGeoParamsError para parâmetros inválidos
// Query: ST_DWithin(cities.geom, ST_MakePoint(lng, lat), raioMetros)
//        WHERE categoria = 'municipio'
```

---

## apps/web/server/repositories

### `cnpj.repository.ts`

Único ponto de acesso ao Prisma para a tabela `company_cnpj`.

```typescript
import { findByFilters, countByFiltersCapped, findByFiltersWithEmail } from "@/server/repositories/cnpj.repository";
import type { FindByFiltersInput, PageResult } from "@/server/repositories/cnpj.repository";

// Paginação cursor-based
const page: PageResult = await findByFilters(filters, { cursor: BigInt("0"), limit: 100 });
// page.items: CnpjListItem[]
// page.nextCursor: BigInt | null

// Contagem com teto
const result = await countByFiltersCapped(filters, 10_000);
// Usa findMany({ take: cap+1, select: { id, uf } }) para reutilizar buildWhere

// Busca com e-mail (para campanhas)
const companies = await findByFiltersWithEmail(filters);
// Retorna apenas empresas que têm e-mail preenchido
```

**`buildWhere` (interno):** Traduz `FindByFiltersInput` em cláusula Prisma `where`, incluindo:
- `uf: { equals: ... }` — ativa partition pruning
- `municipio_codigo: { in: [...] }` — quando resolução geográfica retorna múltiplos
- `cnae_principal: { startsWith: prefixo }` — usando índice `bpchar_pattern_ops`
- `situacao`, `porte`, `matriz_filial`, `opcao_simples`, `opcao_mei` — filtros diretos
- `data_abertura: { gte: ..., lte: ... }` — intervalo de data

---

### `email-campaign.repository.ts`

```typescript
// Principais funções:
findBouncedEmails(): Promise<string[]>        // todos os e-mails com bounce
findUnsubscribedEmails(): Promise<string[]>   // todos os e-mails descadastrados
createCampaign(input): Promise<EmailCampaign>
createRecipients(campaignId, recipients): Promise<number>   // retorna count
replaceRecipients(campaignId, recipients): Promise<number>  // transação: delete + insert
updateCampaignStatus(id, status, extra?): Promise<void>
findRecipientByResendId(resendMessageId): Promise<EmailRecipient | null>
updateRecipientStatus(id, status): Promise<void>
incrementCampaignBounces(campaignId): Promise<void>
upsertBounce(email, tipo, motivo?): Promise<void>
upsertUnsubscribe(email, campaignId?): Promise<void>
findRecentRecipientByEmail(email): Promise<EmailRecipient | null>
findCampaignsWithStats(userId): Promise<CampaignWithStats[]>
```

---

## apps/workers

### `queues/export-queue-consumer.ts`

```typescript
import { createExportWorker } from "./export-queue-consumer.js";

const worker = createExportWorker();
// BullMQ Worker com concurrency = 2
// Retry: 3 tentativas, backoff exponencial 5s
// SIGTERM/SIGINT: graceful shutdown
```

**Pipeline interno do processador:**
1. `UPDATE cnpj_export_jobs SET status = 'running'`
2. `resolveMunicipioCodigos(filtros)` — ST_DWithin via `prisma.$queryRaw`
3. `exportToCsv(prisma, filters, storageKey, onProgress)`
   - `prisma.companyCnpj.findMany({ cursor, take, where })` — cursor pagination
   - pipe: dados → `csv-stringify` → `PassThrough` → `zlib.createGzip()` → S3 multipart
   - `onProgress(rows)`: atualiza `progresso_pct` a cada N linhas
4. `UPDATE SET status='completed', storage_key, linhas, tamanho_bytes, concluido_em`
5. Em falha final: `UPDATE SET status='failed', erro`

---

### `queues/email-campaign-consumer.ts`

```typescript
import { createEmailCampaignWorker } from "./email-campaign-consumer.js";

const worker = createEmailCampaignWorker();
// BullMQ Worker com concurrency = 1 (campanhas sequenciais)
// Retry: 1 tentativa (falhas individuais não abortam a campanha)
```

**Pipeline interno:**
1. Buscar campanha pelo ID
2. Buscar destinatários `pendente` (idempotente em retries)
3. Batch-fetch de dados de empresa por UF (partition pruning)
4. Para cada destinatário:
   - `renderTemplate(corpo_template, vars)` — substitui `{{variavel}}`
   - `appendUnsubscribeFooter()` — garante link de descadastro
   - `resend.emails.send(...)` — cabeçalhos RFC 8058
   - Atualiza `EmailRecipient.status` e `resend_message_id`
   - `sleep(EMAIL_SEND_DELAY_MS)`
5. `UPDATE EmailCampaign SET status='concluida', total_enviados, enviado_em`

---

## apps/workers/scripts

### `import-receita/index.ts`

Script de importação da base da Receita Federal.

```bash
# Executar:
npx tsx apps/workers/src/scripts/import-receita/index.ts /caminho/para/zip/

# Fluxo:
# 1. Descomprime ZIPs da Receita
# 2. Cria staging tables (company_cnpj_staging)
# 3. COPY streaming dos CSVs para staging
# 4. INSERT INTO company_cnpj SELECT ... FROM staging (por UF)
# 5. DROP staging tables
```

**Ordem de importação (dependências):**
1. Dicionários (CNAEs, municípios, naturezas, qualificações, países)
2. Empresas (dados básicos)
3. Estabelecimentos (endereços, situação, CNAE)
4. Sócios (QSA — dados de pessoa física, LGPD-sensíveis)
5. Simples Nacional

### `geocode-cnpj.ts`

```bash
npx tsx apps/workers/src/scripts/geocode-cnpj.ts
# Busca CNPJs sem geom, geocodifica via Google Geocoding API
# Atualiza latitude, longitude e geom (PostGIS GEOGRAPHY)
```

### `backup-postgres.ts`

```bash
npx tsx apps/workers/src/scripts/backup-postgres.ts
# pg_dump -Fc → gzip → upload R2 (radar-backups/)
# Retenção: 7 dias diários, 30 dias semanais
```

### `analytics/refresh.ts`

```bash
npx tsx apps/workers/src/scripts/analytics/refresh.ts
# Atualiza views materializadas no schema analytics
# Executar após import-receita ou periodicamente (cron semanal recomendado)
```

---

## hooks/useCnpjFilters.ts

Hook React que sincroniza filtros de CNPJ com a URL (query params).

```typescript
import { useCnpjFilters } from "@/hooks/useCnpjFilters";

const { filters, removeFilter, clearFilters, updateFilter } = useCnpjFilters();

// filters: CnpjSearchFilters (validado com Zod, lido da URL)
// removeFilter("situacao"): remove um filtro específico da URL
// clearFilters(): remove todos os filtros
// updateFilter({ situacao: "Ativa" }): atualiza um filtro na URL
```

**Comportamento:**
- Lê `useSearchParams()` e valida com `CnpjSearchFiltersSchema.safeParse()`
- Valores inválidos na URL são silenciosamente ignorados (retorna `{}` para aquele campo)
- Usa `router.push()` para atualizar URL sem reload
- Preserva filtros ao navegar entre `/mapa` ↔ `/cnpjs`

---

## Variáveis de Ambiente

### apps/web (.env.local)

| Variável | Obrigatória | Descrição |
|---|---|---|
| `DATABASE_URL` | Sim | `postgresql://user:pass@host:5432/db?schema=public` |
| `AUTH_SECRET` | Sim | String aleatória (min 32 chars) para assinar JWTs |
| `AUTH_URL` | Sim | URL base do app (ex: `https://radar.empresa.com.br`) |
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | Sim | Chave do Maps JS API (restrita por HTTP referrer) |
| `GOOGLE_PLACES_API_KEY` | Sim | Chave do Places API (restrita por IP) |
| `REDIS_URL` | Sim | `redis://host:6379` |
| `R2_ENDPOINT` | Sim | URL do endpoint R2 ou MinIO |
| `R2_ACCESS_KEY_ID` | Sim | Credencial R2 |
| `R2_SECRET_ACCESS_KEY` | Sim | Credencial R2 |
| `R2_BUCKET` | Sim | Nome do bucket de exports |
| `RESEND_API_KEY` | Sim (Fase 5) | Chave da API do Resend |
| `RESEND_FROM_EMAIL` | Sim (Fase 5) | E-mail remetente (verificado no Resend) |
| `RESEND_WEBHOOK_SECRET` | Sim (Fase 5) | Segredo SVIX para validação de webhooks |
| `UNSUBSCRIBE_TOKEN_SECRET` | Sim (Fase 5) | Segredo para tokens de descadastro |
| `APP_URL` | Sim (Fase 5) | URL pública do app (para links de descadastro) |
| `EMAIL_SEND_DELAY_MS` | Não | Delay entre envios de e-mail (padrão: 350ms) |
| `PLACES_CACHE_TTL_DAYS` | Não | TTL do cache de Places (padrão: 30) |
| `CNPJ_EXPORT_PRESIGNED_URL_EXPIRY_HOURS` | Não | Validade da URL de download (padrão: 4) |

### packages/db (.env)

| Variável | Descrição |
|---|---|
| `DATABASE_URL` | Igual ao acima |
| `SEED_ADMIN_EMAIL` | E-mail do usuário admin inicial |
| `SEED_ADMIN_PASSWORD` | Senha do usuário admin inicial |

---

## Convenções de Nomenclatura

| Escopo | Convenção | Exemplo |
|---|---|---|
| Modelos Prisma | PascalCase | `CompanyCnpj`, `EmailRecipient` |
| Tabelas SQL | snake_case | `company_cnpj`, `email_recipients` |
| Partições | snake_case + sufixo UF | `company_cnpj_sp`, `company_cnpj_rj` |
| Variáveis TS | camelCase | `razaoSocial`, `cnaePrefix` |
| Campos de BD | snake_case | `razao_social`, `cnae_principal` |
| Rotas de API | kebab-case | `/api/cnpj/export-jobs` |
| Arquivos TS | kebab-case | `cnpj-search.service.ts` |
| Commits | Conventional Commits | `feat: adicionar filtro por porte` |
| Filas BullMQ | kebab-case | `cnpj-export`, `email-campaign` |

---

## Testes

```bash
# Rodar todos os testes
npm test --workspace=apps/web

# Arquivos de teste:
apps/web/src/__tests__/
  auth.test.ts                         ← Testes de autenticação
  api/cnpj-companies.integration.test.ts
  api/cnpj-export-jobs.integration.test.ts

apps/web/src/server/services/
  cnpj-search.service.test.ts
  export.service.test.ts
  email-campaign.service.test.ts
  places-search.service.test.ts
  radius-search.service.test.ts

apps/web/src/hooks/
  useCnpjFilters.test.ts
```

**Nota sobre mocking em testes de integração com Next.js:**
```typescript
// CORRETO — sempre usar factory para vi.mock de @/auth
vi.mock("@/auth", () => ({ auth: vi.fn() }));

// ERRADO — sem factory force-carrega next/server → erro em Node.js
vi.mock("@/auth");

// Criar NextRequest em testes:
const req = new Request("http://localhost/api/cnpj/companies?uf=SP");
// (não usar NextRequest diretamente — NextRequest depende do ambiente Edge)
```
