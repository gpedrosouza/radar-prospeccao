# Roadmap de Melhorias Pós-MVP
## Radar de Prospecção Geográfica — v2.x e além

> Este documento é derivado de uma análise completa do código-fonte, arquitetura, e contexto de negócio do sistema. As melhorias estão ordenadas por impacto × esforço, com os quick wins no topo de cada seção.

---

## Contexto: onde o MVP está forte e onde está frágil

**Pontos fortes do MVP atual:**
- Particionamento por UF é correto desde o dia 1 — escalará bem até 100M+ registros
- SSE para progresso de exportação é elegante e simples de manter
- Cache de Places por grid geográfico reduz custos de API em 80–95%
- Auth.js split config (Edge vs Node) está resolvido corretamente
- Rate limiting de exportações é DB-based, sem race condition

**Dívidas técnicas e riscos identificados:**
- Zero observabilidade em produção (sem métricas, sem tracing distribuído)
- Workers sem circuit breaker — falha em massa de geocodificação ou Resend não tem retry inteligente
- Geocodificação em script manual — não tem fila, não tem progresso, bloqueia o worker inteiro
- Campanhas de e-mail usam snapshot de recipients no momento do disparo — sem refresh automático
- Frontend sem testes de integração (apenas unit tests de `computeRemovedParams`)
- `countByFiltersCapped` com `take: 10001` lê IDs desnecessariamente — pode ser otimizado

---

## Categoria 1 — Observabilidade e Confiabilidade (Prioridade Alta)

### M1.1 — Distributed Tracing com OpenTelemetry
**Por quê:** Em produção, quando uma exportação falha às 3am, atualmente não há como saber se foi o worker, a fila, o banco, ou a escrita no R2 sem vasculhar logs manualmente.

**O que fazer:**
- Instrumentar `apps/web` e `apps/workers` com `@opentelemetry/sdk-node`
- Exportar traces para Grafana Tempo ou Jaeger (self-hosted) ou Honeycomb (cloud, free tier)
- Adicionar spans em: chamadas ao Prisma, chamadas ao Redis/BullMQ, chamadas ao R2, chamadas ao Google APIs, chamadas ao Resend

**Esforço:** 2–3 dias de desenvolvimento
**Impacto:** Reduz MTTR (tempo médio de resolução de incidentes) em ~80%

---

### M1.2 — Métricas de aplicação com Prometheus + Grafana
**Por quê:** Atualmente a única "métrica" é o health check (`/api/health`). Não há como saber se a taxa de erro está subindo antes de um usuário reclamar.

**O que monitorar:**
- Jobs de exportação: taxa de sucesso/falha, duração, tamanho do arquivo
- Campanhas de e-mail: bounce rate, open rate, tempo de processamento
- Queries lentas no Postgres (via `pg_stat_statements`)
- Tamanho da fila BullMQ (jobs acumulados = worker com problemas)
- Cache hit rate do Places (valida se o cache realmente economiza)

**Esforço:** 3–4 dias
**Impacto:** Prevenção de incidentes vs. resposta reativa

---

### M1.3 — Sentry para rastreamento de erros
**Por quê:** Erros de runtime em produção (especialmente no worker) atualmente desaparecem sem rastro.

**O que fazer:**
- `npm install @sentry/nextjs @sentry/node`
- Configurar `sentry.client.config.ts`, `sentry.server.config.ts`, `sentry.edge.config.ts`
- Adicionar no worker: `Sentry.init()` + handler de erros não capturados
- Free tier do Sentry cobre ~5k eventos/mês

**Esforço:** 1 dia
**Impacto:** Visibilidade imediata de bugs em produção

---

### M1.4 — Circuit Breaker nos Workers
**Por quê:** Se o Resend retornar 5xx por 1 hora, o worker de e-mail vai tentar enviar, falhar, e potencialmente corromper o estado dos destinatários (ou queimar todos os retries do BullMQ).

**O que fazer:**
- Implementar circuit breaker com `cockatiel` ou `opossum` no consumer de e-mail
- Estados: Fechado (funciona normalmente) → Aberto (para de tentar por N minutos) → Meio-aberto (teste)
- Aplicar também no worker de geocodificação para falhas do Google Geocoding API

**Esforço:** 2 dias
**Impacto:** Resiliência em falhas de terceiros sem cascata de erros

---

## Categoria 2 — Performance e Escala (Prioridade Alta)

### M2.1 — Fila de Geocodificação com BullMQ
**Problema atual:** A geocodificação é um script monolítico (`geocode-cnpj.ts`) que roda de forma síncrona, sem progresso, sem retry por registro, sem pausa entre chamadas controlada.

**O que fazer:**
- Criar fila BullMQ `geocode-cnpj` com payload `{ id, cnpj, uf, logradouro, municipio }`
- Worker com `concurrency: 5` (respeitando rate limit do Google Geocoding: 50 req/s)
- Retry automático com backoff exponencial em erros 429
- Progress tracking via SSE (igual às exportações)
- Admin pode iniciar geocodificação de lote pelo painel sem acessar o container

**Esforço:** 3–4 dias
**Impacto:** Geocodificação confiável e monitorável; possibilidade de rodar em paralelo

---

### M2.2 — `countByFiltersCapped` otimizado
**Problema atual:** O count usa `findMany({ take: 10001, select: { id, uf } })` que lê 10.001 registros desnecessariamente para determinar se o total ultrapassa o cap.

**Alternativa mais eficiente:**
```sql
-- SQL com LIMIT no COUNT
SELECT COUNT(*) FROM (
  SELECT 1 FROM company_cnpj 
  WHERE uf = ? AND ...
  LIMIT 10001
) subquery
```

Isso permite ao PostgreSQL parar de varrer tão logo encontre 10.001 registros, sem precisar retornar os IDs. Requer SQL raw com `prisma.$queryRaw` mas mantém o partition pruning via `WHERE uf = ?`.

**Esforço:** 1 dia (incluindo ajuste nos testes)
**Impacto:** ~30–50% de redução no tempo de resposta para queries com muitos resultados

---

### M2.3 — Cache de contagem com Redis
**Por quê:** O count com cap é executado a cada requisição na tela de CNPJs (no mesmo request que o `searchCnpjs`). Com filtros fixos, o mesmo count é repetido a cada scroll de página.

**O que fazer:**
- Criar hash key baseado nos parâmetros de filtro (incluindo `uf`, `cnae`, `porte`, etc.)
- Cachear no Redis com TTL de 60 segundos
- Invalidar quando houver importação nova da Receita (via event no worker)

**Esforço:** 1 dia
**Impacto:** Redução significativa de carga no banco em sessões de filtro repetitivo

---

### M2.4 — Índice composto para busca comum
**Análise:** A combinação de filtros mais frequente em produção provavelmente será `(uf, situacao, cnae_prefixo)`. O índice atual é individual por coluna.

**O que adicionar (via migration SQL manual):**
```sql
CREATE INDEX CONCURRENTLY idx_company_cnpj_uf_situacao_cnae
ON company_cnpj (uf, situacao_cadastral, cnae_fiscal_principal varchar_pattern_ops)
WHERE situacao_cadastral = 'Ativa';
```

**Importante:** Criar `CONCURRENTLY` para não bloquear reads na tabela de produção.

**Esforço:** 0,5 dia (escrever migration + validar com EXPLAIN ANALYZE)
**Impacto:** Eliminação de seq scans nas queries mais comuns

---

## Categoria 3 — Funcionalidades de Produto (Prioridade Média)

### M3.1 — Recuperação de senha para bankers
**Problema:** Atualmente não há recuperação automática de senha — o admin precisa resetar manualmente.

**O que fazer:**
- Adicionar fluxo: `/esqueci-senha` → envia e-mail com token HMAC (igual ao descadastro) → `/redefinir-senha?token=...`
- Token com TTL de 1 hora, invalidado após uso
- Usar Resend para envio do e-mail (já configurado)

**Esforço:** 1,5 dias
**Impacto:** Reduz suporte a usuários; obrigatório antes de ter muitos bankers

---

### M3.2 — Dashboard analytics para gestores
**Por quê:** O gestor regional não tem visibilidade sobre o uso — quais bankers estão usando, quantas exportações foram feitas, quais regiões são mais prospectadas.

**O que fazer:**
- Usar o schema `analytics` já existente
- Criar views materializadas: `exportacoes_por_usuario`, `buscas_por_regiao`, `campanhas_por_status`
- Tela `/dashboard` com cards de resumo e gráficos (recharts, já no stack via Next.js)
- Refrescar views materializadas via cron job a cada 6 horas

**Esforço:** 4–5 dias
**Impacto:** Gestão baseada em dados; justifica o ROI do sistema

---

### M3.3 — Enriquecimento de dados via Google Places
**Por quê:** Empresas ativas na Receita muitas vezes estão fechadas na prática. O Places API pode validar se o estabelecimento realmente aparece no Google Maps com "Aberto/Fechado".

**O que fazer:**
- Campo `places_verified_at` e `places_verified_status` na tabela `company_cnpj`
- Worker que cruza CNPJs com PlacesCache por proximidade geográfica
- Na UI: badge "Verificado Google" nos marcadores do mapa

**Esforço:** 3–4 dias
**Impacto:** Lista de prospecção muito mais qualificada; menos visitas "perdidas"

---

### M3.4 — CRM leve: anotações por empresa
**Por quê:** Após a visita, o banker não tem onde registrar o resultado da abordagem dentro do sistema.

**O que fazer:**
- Tabela `company_note (id, cnpj, uf, banker_id, content, status_abordagem, created_at)`
- Status: pendente_contato / contactado / reunião_agendada / proposta_enviada / convertido / sem_interesse
- Tela `/minha-carteira` com lista de empresas marcadas + status pipeline

**Esforço:** 5–7 dias
**Impacto:** Fecha o ciclo de prospecção dentro do sistema; aumenta retenção dos usuários

---

### M3.5 — Importação incremental da Receita Federal
**Problema atual:** A importação é full refresh — todo mês, os 66M registros são reimportados do zero, demorando 2–4 horas e exigindo janela de manutenção.

**O que fazer:**
- A Receita disponibiliza "Layouts" com data de atualização por arquivo
- Comparar hash dos ZIPs novos com os processados anteriormente
- Importar apenas os CNPJs modificados/adicionados
- Usar campo `data_situacao_cadastral` para detectar mudanças

**Esforço:** 5–8 dias (complexidade alta)
**Impacto:** Importação mensal em minutos em vez de horas; sem janela de manutenção

---

## Categoria 4 — DevX e Qualidade (Prioridade Média)

### M4.1 — Testes de integração de ponta a ponta (Playwright)
**Problema:** Atualmente os testes cobrem serviços e rotas com Vitest, mas não há testes que validem os fluxos completos de UI (login → filtrar → exportar → baixar).

**O que fazer:**
- Adicionar Playwright para testes E2E
- Cenários críticos: login, fluxo de exportação completo, campanha de e-mail
- Rodar no CI antes do deploy

**Esforço:** 3–4 dias
**Impacto:** Detecta regressões de UI antes de chegar em produção

---

### M4.2 — Storybook para componentes de UI
**Por quê:** `FilterChips`, `StatBar`, e os cards de exportação são componentes que serão reutilizados. Sem documentação visual, novos devs não sabem como usar os estados.

**O que fazer:**
- Adicionar Storybook ao `apps/web`
- Documentar: `FilterChips` (com/sem filtros), `ExportCard` (estados: pending/processing/done/failed), `MapMarker` (cores por situação)

**Esforço:** 2 dias
**Impacto:** Onboarding mais rápido de desenvolvedores; menos bugs de UI

---

### M4.3 — Validação de variáveis de ambiente na inicialização
**Problema:** Se `AUTH_SECRET` estiver vazia em produção, o Next.js sobe mas as sessões ficam quebradas. Só é descoberto quando um usuário tenta fazer login.

**O que fazer:**
```typescript
// apps/web/src/lib/env.ts
import { z } from "zod"

const envSchema = z.object({
  AUTH_SECRET: z.string().min(32),
  DATABASE_URL: z.string().url(),
  AUTH_URL: z.string().url(),
  // ...
})

export const env = envSchema.parse(process.env)
```

Importar em `layout.tsx` — o build falha se uma variável obrigatória estiver ausente.

**Esforço:** 0,5 dia
**Impacto:** Detecta configuração incorreta imediatamente no startup, não em runtime

---

### M4.4 — Migração do `Dockerfile` para multi-stage build otimizado
**Problema atual:** O build de produção provavelmente inclui `devDependencies` e o cache das camadas não está otimizado para CI.

**O que fazer:**
- Stage 1: `deps` — instala apenas prod dependencies
- Stage 2: `builder` — compila o Next.js com node_modules completo
- Stage 3: `runner` — imagem final com apenas o build output + prod deps
- Resultado: imagem ~3x menor; pull do GHCR mais rápido no deploy

**Esforço:** 1 dia
**Impacto:** Deploy 50–70% mais rápido; menor surface de ataque na imagem de produção

---

## Categoria 5 — Escala Horizontal (Prioridade Baixa — Para Mais de 50 Bankers)

### M5.1 — Migrar para Managed Database (RDS / DigitalOcean Managed Postgres)
**Quando:** Quando o banco de dados for o gargalo de performance OU quando houver necessidade de failover automático.

**Por quê não agora:** VPS único com Postgres containerizado é mais barato e suficiente para o MVP. Managed DB custa 2–3x mais.

**Benefícios:** Backups automáticos, failover, read replicas, tuning automático.

---

### M5.2 — Read Replica para queries de analytics
**Quando:** Quando os relatórios de analytics (`schema analytics`) começarem a interferir na performance das queries de busca.

**O que fazer:**
- Configurar read replica do Postgres (1 réplica síncrona)
- Direcionar todas as queries de `analytics` para a réplica
- Usar `DATABASE_URL_REPLICA` no Prisma via `$replica()` (feature do Prisma 5.x)

---

### M5.3 — CDN para assets estáticos
**Quando:** Quando o número de bankers em regiões distribuídas causar latência perceptível no carregamento do frontend.

**O que fazer:**
- Configurar Cloudflare CDN na frente da VPS (free tier)
- Cache de assets estáticos do Next.js no edge do Cloudflare
- O Caddy já faz parte do trabalho, mas o Cloudflare adiciona PoPs globais

---

## Priorização Sugerida por Fase

### Próximo sprint (1–2 semanas) — Quick wins

| # | Melhoria | Esforço | Impacto |
|---|---|---|---|
| 1 | M4.3 — Validação de env na inicialização | 0,5 dia | Previne incidente em produção |
| 2 | M1.3 — Sentry para rastreamento de erros | 1 dia | Visibilidade imediata |
| 3 | M3.1 — Recuperação de senha | 1,5 dias | Necessidade de produto antes de onboarding |
| 4 | M2.2 — `countByFiltersCapped` otimizado | 1 dia | Performance de resposta |

### Sprint 2 (2–4 semanas)

| # | Melhoria | Esforço | Impacto |
|---|---|---|---|
| 5 | M1.1 — OpenTelemetry | 2–3 dias | Observabilidade completa |
| 6 | M2.1 — Fila de geocodificação | 3–4 dias | Confiabilidade da geocodificação |
| 7 | M4.4 — Docker multi-stage | 1 dia | Deploy mais rápido |
| 8 | M1.4 — Circuit breaker nos workers | 2 dias | Resiliência |

### Após validação de mercado (1–3 meses)

| # | Melhoria | Esforço | Impacto |
|---|---|---|---|
| 9 | M3.4 — CRM leve | 5–7 dias | Fechamento do ciclo de prospecção |
| 10 | M3.2 — Dashboard analytics | 4–5 dias | Valor para gestores |
| 11 | M3.3 — Enriquecimento Places | 3–4 dias | Lista mais qualificada |
| 12 | M4.1 — Testes Playwright | 3–4 dias | Qualidade em escala |
| 13 | M2.4 — Índice composto | 0,5 dia | Performance em produção |

---

## Débitos Técnicos a Não Acumular

Estes itens **devem** ser resolvidos antes de qualquer nova feature se o sistema crescer:

1. **Falta de middleware de autenticação nos workers:** Os workers de BullMQ rodam sem autenticação no endpoint de administração — se exposto, qualquer um pode enfileirar jobs. Garantir que o painel BullMQ (se habilitado) fique atrás de autenticação.

2. **`PlacesCache` sem índice no campo `grid_cell`:** A busca de cache é feita por `grid_cell` mas pode não ter índice (verificar). Sem índice, cada busca no Places é um seq scan.

3. **Workers sem graceful shutdown:** Se o container for reiniciado com um job em andamento, o job pode ficar em estado "ativo" para sempre sem reprocessamento. Implementar handler de `SIGTERM` que aguarda o job atual terminar.

4. **Logs estruturados (JSON) nos workers:** Atualmente os logs provavelmente são `console.log` em texto livre. Migrar para `pino` ou `winston` com JSON estruturado para que ferramentas de log (Grafana Loki, Better Stack) possam parsear e filtrar.

---

*Roadmap elaborado com base na análise completa do código-fonte em Junho/2026. Revisão sugerida a cada 3 meses conforme feedback de usuários em produção.*
