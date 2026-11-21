# Prompt 10 — Camada de Services e Repositories

> Fase: 2 — Core
> Pré-requisito: Fase 1 completa

---

## Prompt

```
Leia o CLAUDE.md na raiz do projeto. Uma regra inegociável: rotas de API nunca tocam Prisma
diretamente, sempre passam por server/services -> server/repositories.

Em apps/web/src/server, crie a seguinte estrutura:

repositories/
  cnpj.repository.ts     ← único lugar que faz queries Prisma sobre CompanyCnpj
  city.repository.ts     ← queries sobre City (incluindo busca por raio via PostGIS)
  export-job.repository.ts

services/
  cnpj-search.service.ts   ← lógica de filtro/busca de CNPJs, usa cnpj.repository
  radius-search.service.ts ← lógica de busca de cidades no raio, usa city.repository
  export.service.ts        ← lógica de criação/consulta de jobs de exportação

Para cada repository, implemente:
- cnpj.repository.ts: uma função findByFilters(filtros, { cursor, limit }) que aceita UF,
  cidade/raio (lista de municipio_codigo), situação, prefixo de CNAE, porte, matriz/filial,
  simples/mei, intervalo de data de abertura — e retorna resultados paginados por cursor
  (NUNCA por OFFSET, conforme validamos na Fase 1 que cursor é muito mais rápido)
- city.repository.ts: uma função findWithinRadius(lat, lng, raioKm) usando a função PostGIS
  ST_DWithin sobre a coluna geom de City
- export-job.repository.ts: CRUD básico sobre a tabela CnpjExportJob

Para os services, a lógica de negócio (validação de filtros com Zod, combinação de regras como
"se há cidades no raio, usar isso como filtro principal e a cidade de referência como fallback")
fica aqui, não nos repositories.

Crie também em packages/shared:
- Um schema Zod para os filtros de busca de CNPJ (vai ser reusado pela rota de API E pelo
  worker de exportação, que precisa validar os mesmos filtros)

Escreva testes Vitest para os services, usando um repository mockado (não precisa de banco
real rodando para os testes de service) — teste especialmente a lógica de "cidades no raio
como filtro principal vs fallback de cidade única".

Não crie ainda as rotas de API (isso é o próximo prompt) — foque só na camada de lógica.
```

## Após rodar este prompt
- Rode os testes Vitest e confirme que passam sem precisar do banco real
- Avance para `11-bullmq-redis-setup.md`
