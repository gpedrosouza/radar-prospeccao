# Prompt 05 — Criar o CLAUDE.md da Raiz (Memória Persistente do Projeto)

> Fase: 0 — Fundação
> Pré-requisito: prompts 01 a 04 concluídos
> ⚠️ Este arquivo é a peça central da gestão de contexto entre sessões — o Claude Code lê
> CLAUDE.md automaticamente ao iniciar em qualquer subpasta do projeto.

---

## Prompt

```
Quero que você crie um arquivo CLAUDE.md na raiz do repositório. Este arquivo é lido
automaticamente por você (Claude Code) no início de cada sessão futura neste projeto, e serve
como a memória persistente do projeto entre sessões diferentes. Ele precisa ser denso em
informação útil e curto o suficiente para não desperdiçar contexto.

Inclua as seguintes seções:

## Sobre o projeto
Um resumo de 3-4 linhas: sistema de prospecção geográfica de empresas para personal bankers,
cruzando base de CNPJs da Receita Federal (~66M registros) com Google Places e geolocalização
por raio. Recomeço do zero a partir de uma v1 que cresceu organicamente e teve problemas de
performance/arquitetura.

## Regras arquiteturais inegociáveis
1. apps/web e apps/workers NUNCA importam um do outro
2. Toda lógica de negócio fica em server/services, rotas de API nunca tocam Prisma direto
   (sempre via server/repositories)
3. A tabela CompanyCnpj é particionada por UF — qualquer alteração nela precisa de migration
   SQL manual, não só prisma migrate
4. Jobs longos (exportação, enriquecimento) SEMPRE via fila BullMQ, nunca processamento síncrono
   numa rota de API
5. Arquivos de exportação vão para Cloudflare R2, nunca para disco local do container
6. Nenhuma query de UI agrega direto sobre CompanyCnpj — agregações usam o schema `analytics`

## Stack
Next.js 15 (App Router) + TypeScript estrito, Prisma, PostgreSQL 16 + PostGIS, Redis + BullMQ,
Cloudflare R2, Resend (e-mail, fase futura), Google Maps/Places API, Vitest, Docker Compose.

## Estrutura do monorepo
(cole aqui a árvore de pastas real do projeto neste momento)

## Como rodar localmente
docker compose up -d
npm install
npm run db:migrate --workspace=packages/db
npm run dev --workspace=apps/web

## Convenções de código
- TypeScript strict, sem `any` não justificado
- Nomes de tabelas em PascalCase no Prisma, snake_case no SQL raw das partições
- Commits seguindo Conventional Commits (feat:, fix:, chore:, etc.)
- Toda função de service tem teste Vitest correspondente

## Onde encontrar mais contexto
Existe um vault Obsidian com toda a documentação de produto, arquitetura e decisões em
[caminho do vault, ajustar quando eu disser onde ele vai ficar]. Documentos relevantes:
- Visão geral do produto e personas
- Modelo de dados completo (com SQL das partições e índices)
- ADRs (Architecture Decision Records) explicando o "porquê" de cada decisão estrutural
- Status atual do desenvolvimento (qual fase estamos, o que falta)

Quando eu mencionar "veja o ADR-00X" ou "veja Status Atual", isso se refere a arquivos desse
vault — me peça para colar o conteúdo se você não tiver acesso direto ao arquivo.

## Fase atual do projeto
Fase 0 — Fundação (em andamento)

---

Depois de criar o arquivo, me mostre o conteúdo final para eu revisar antes de commitar.
```

## Após rodar este prompt

1. **Revise o CLAUDE.md gerado** — compare com [[00-INDEX]] e [[03-Fases-Desenvolvimento/Status-Atual]] do vault
2. Ajuste a seção "Fase atual" sempre que avançar de fase
3. **Importante:** sempre que você atualizar `Status-Atual.md` no Obsidian, copie o resumo relevante também para o `CLAUDE.md` do repositório — são dois sistemas de memória que precisam ficar sincronizados manualmente (o vault é mais detalhado, o CLAUDE.md é o resumo que o Claude Code sempre vê)
4. Isso conclui a Fase 0. Avance para os prompts da Fase 1 (`06-importador-receita-copy.md` em diante)
