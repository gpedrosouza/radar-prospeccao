# Prompt 01 — Setup do Monorepo

> Fase: 0 — Fundação
> Pré-requisito: nenhum (primeiro prompt do projeto)
> Use no Claude Code, dentro de uma pasta vazia que será a raiz do repositório.

---

## Prompt

```
Vou criar um projeto novo chamado "radar-prospeccao" do zero. É um sistema de prospecção geográfica de empresas (CNPJs) para personal bankers, que cruza dados da Receita Federal (base de ~66 milhões de CNPJs) com Google Places, mapas e geolocalização por raio.

Quero um monorepo com a seguinte estrutura:

radar-prospeccao/
├── apps/
│   ├── web/              ← Next.js 15 (App Router), TypeScript estrito
│   └── workers/          ← Node standalone em TypeScript, SEM nenhuma dependência de apps/web
├── packages/
│   ├── db/               ← Prisma (schema, client, seeds) — usado por web E workers
│   └── shared/           ← tipos TypeScript e validadores Zod compartilhados
├── docker-compose.yml
├── .gitignore
├── package.json (workspaces)
└── README.md

Regras importantes que quero que você siga e documente:
1. apps/workers NUNCA importa nada de apps/web, e vice-versa. Tudo que os dois precisam fica em packages/.
2. Use npm workspaces (não pnpm nem yarn, para manter simples).
3. apps/web usa Next.js 15 com App Router, React 19, TypeScript em modo strict.
4. apps/workers é só Node + TypeScript compilado (tsx ou tsc), sem framework web.
5. packages/db vai conter o schema Prisma (ainda vazio/mínimo nesta etapa) e exportar o client gerado.
6. packages/shared vai conter um arquivo de tipos vazio por agora, e zod como dependência.
7. Configure ESLint e Prettier compartilhados na raiz.
8. .gitignore deve cobrir node_modules, .next, .env*.local, dist, e qualquer pasta de dados baixados da Receita (ex: dados_abertos_cnpj/).

Depois de criar a estrutura, rode os comandos necessários para validar que:
- `npm install` funciona na raiz
- `npm run build --workspace=apps/web` não falha (mesmo com app quase vazio)
- Não há nenhum import cruzado entre apps/web e apps/workers

Ao final, me dê um resumo do que foi criado e quais decisões você tomou que não estavam explícitas no meu pedido.
```

## Após rodar este prompt
- Confirme que a estrutura bate com [[01-Arquitetura/Arquitetura-Geral]]
- Avance para `02-docker-compose-postgres.md`
