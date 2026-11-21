# Prompt 22 — CI/CD: Deploy Automático via GitHub Actions + SSH

> Fase: 4 — Workers e Escala
> Pré-requisito: `21-docker-compose-prod-caddy.md` concluído

---

## Prompt

```
Leia o CLAUDE.md na raiz do projeto.

Vamos configurar deploy automático: ao fazer merge na branch main, o GitHub Actions deve
construir as imagens Docker e fazer o deploy na VPS de produção via SSH. Mantemos simples —
sem Kubernetes, sem orquestrador externo, conforme decidido para o estágio do MVP.

Crie/ajuste o workflow .github/workflows/deploy.yml com os seguintes jobs:

1. **test** (já deve existir parcialmente do CI básico da Fase 0 — confirme e complete):
   - Roda em todo PR e push para main
   - npm install, lint, typecheck, vitest run

2. **build-and-push** (só em push para main, depois que test passar):
   - Builda as imagens Docker de apps/web e apps/workers
   - Faz push para um registry (GitHub Container Registry - ghcr.io, que é gratuito para
     repositórios privados de uso razoável)
   - Tag das imagens com o SHA do commit E "latest"

3. **deploy** (só em push para main, depois que build-and-push passar):
   - Via SSH (usando a action appleboy/ssh-action ou similar), conecta na VPS de produção
   - Faz: docker compose -f docker-compose.prod.yml pull && docker compose -f
     docker-compose.prod.yml up -d
   - Roda as migrations pendentes do Prisma (npm run db:migrate) ANTES de subir a nova versão
     do web, para evitar incompatibilidade de schema durante o rolling restart

Secrets necessários no GitHub (liste todos que preciso configurar manualmente no painel do
repositório, não tente criar isso via código): SSH_HOST, SSH_USER, SSH_PRIVATE_KEY,
GHCR_TOKEN (ou usar o GITHUB_TOKEN padrão se suficiente), e quaisquer outros que você
identificar como necessários.

Implemente também uma estratégia simples de rollback: se o deploy falhar (por exemplo, a
migration falhar), o workflow deve parar ANTES de substituir os containers em produção,
deixando a versão anterior rodando.

Documente o passo a passo completo (quais secrets configurar, em que ordem, como testar o
workflow manualmente antes de depender dele) em docs/deploy.md.
```

## Após rodar este prompt
- Configure os secrets no GitHub manualmente antes de testar
- Faça um deploy de teste controlado (não direto em produção real na primeira vez)
- Avance para `23-backup-postgres-r2.md`
