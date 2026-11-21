---
tags: [arquitetura, stack]
---

# Stack Técnica

## Tabela de decisão (tecnologia → por quê)

| Camada | Tecnologia | Por quê |
|---|---|---|
| Frontend/SSR | Next.js 15 (App Router) | Já validado na v1; bom suporte a Server Components reduz JS no cliente |
| Linguagem | TypeScript (strict) | Tipagem evita bugs de filtro/query silenciosos com dados em escala |
| ORM | Prisma | Já usado na v1; boa DX; suporta SQL raw quando necessário (particionamento exige raw em alguns pontos) |
| Banco | PostgreSQL 16 + PostGIS | Suporta partição nativa, geoespacial, e é o que a v1 já usa — sem necessidade de trocar |
| Fila | BullMQ + Redis | Troca a tabela de jobs com polling da v1 por fila real: retry automático, dead-letter, dashboard (Bull Board) |
| Storage de arquivos | Cloudflare R2 | Sem taxa de egress — crítico porque bankers vão baixar CSVs com frequência |
| E-mail transacional | Resend | Boa DX, suporta domínio próprio + inbound, preço competitivo no volume esperado |
| Mapa | Google Maps JavaScript API + Places API (New) | Mantido da v1 — trocar exigiria reconstruir toda a camada de geocodificação |
| Validação | Zod | Valida filtros e payloads de API/jobs de forma type-safe |
| Testes | Vitest | Já usado na v1, rápido, boa integração com TS |
| CI | GitHub Actions | Já usado na v1, gratuito para repositório privado em volume baixo |
| Deploy | Docker Compose (MVP) → Coolify/serviços gerenciados (futuro) | Ver [[01-Arquitetura/Infraestrutura-e-Deploy]] |

## O que mudou da v1 para a v2

| v1 | v2 | Motivo da troca |
|---|---|---|
| Tabela `CnpjExportJob` com polling | BullMQ + Redis (tabela continua existindo, mas como espelho de auditoria) | Retry, dead-letter, sem lock otimista manual |
| Arquivos `.csv.gz` em disco local | Cloudflare R2 | Permite múltiplas instâncias/escala horizontal sem disco compartilhado |
| Tudo num processo Next.js | `apps/web` + `apps/workers` separados | Isolamento de carga, conforme análise da v1 |
| Sem autenticação | NextAuth (credentials) desde o dia 1 | Rastreabilidade obrigatória para uso com dados de clientes/CNPJ |
| Tabela `CompanyCnpj` flat | Particionada por UF desde a criação | Performance em escala, ver [[01-Arquitetura/Modelo-de-Dados]] |

## Bibliotecas específicas por funcionalidade

**Importação da Receita:**
- `yauzl` (leitura de ZIP sem extrair tudo em disco) — mantido da v1
- `pg-copy-streams` (nova) — para usar `COPY` nativo do Postgres em vez de INSERT em lote, mais rápido em ordens de magnitude

**Exportação:**
- `csv-stringify` (streaming) — nunca carregar o resultado todo em memória
- Stream direto para R2 via SDK S3-compatível (`@aws-sdk/client-s3` funciona com R2)

**E-mail:**
- `resend` (SDK oficial)
- `react-email` (se quiser templates como componentes React — opcional, MVP pode usar string simples)

## Blueprint visual definitivo (Fase 3)

O design de referência para todas as 4 telas (Mapa, CNPJs, Exportações, Campanhas) está
congelado como protótipo HTML estático, com a identidade visual da **GR Assessoria
Financeira** aplicada (cliente/operador do sistema). Este arquivo é a fonte de verdade visual
— qualquer prompt da Fase 3 que peça para o Claude Code construir uma tela deve referenciar
este arquivo explicitamente para visual, cores, espaçamento e copy de exemplo.

**Localização no repositório de código:** `docs/design/radar-gr-ui.html` (na raiz do projeto,
fora de `apps/` e `packages/` — é documentação de design, não código de produção)

**Paleta de cores (identidade GR Assessoria Financeira):**
```
--gr-teal:        #00B3A9   /* cor primária de ação (botões, links, destaque) */
--gr-teal-dark:   #00958C   /* hover do teal */
--gr-teal-tint:   #E5F7F5   /* fundo de chips, badges, hover de linha */
--gr-navy:        #003650   /* sidebar, topbar de título, texto de destaque */
--gr-navy-light:  #0B4A68   /* hover do navy */

--bg:             #F4F7F8   /* fundo geral da aplicação (light theme) */
--surface:        #FFFFFF   /* cards, painéis, tabela */
--surfaceAlt:     #F8FAFB   /* fundo alternado, headers de tabela */
--border:         #E1E8EB
--border-strong:  #C9D4D8

--textPri:  #0E2430
--textSec:  #51697A
--textMut:  #8FA1AB

--success:    #1A9E6E  /* situação Ativa */
--success-bg: #E4F7EF
--warning:    #C9821A  /* situação Inapta */
--warning-bg: #FBF0DE
--danger:     #D14848  /* situação Baixada */
--danger-bg:  #FBEAEA
```

**Tipografia:** Montserrat (conforme manual de marca da GR), com Inter como fallback de
sistema.

**Diferença importante em relação ao primeiro design (descartado):** a primeira versão usava
dark theme com paleta azul genérica. Essa foi substituída integralmente pela versão com
identidade GR (light theme, navy + teal). Se qualquer prompt antigo ou conversa anterior
mencionar a paleta dark/azul genérica, ela está obsoleta — sempre usar a paleta GR acima.

## O que propositalmente NÃO usamos (e por quê)

| Não usado | Por quê |
|---|---|
| Vercel para hospedagem | Não roda workers de longa duração nativamente; banco de 66M não se beneficia da arquitetura serverless deles |
| Kubernetes | Complexidade desnecessária para o volume de tráfego esperado no MVP |
| GraphQL | REST simples resolve bem; não há necessidade de queries flexíveis do cliente |
| Microsserviços "de verdade" (deploy independente) | Monorepo com processos separados já dá o isolamento necessário sem custo operacional de microsserviços reais |

## Links relacionados
- [[01-Arquitetura/Arquitetura-Geral]]
- [[02-Custos/Custo-Mensal-Consolidado]]
