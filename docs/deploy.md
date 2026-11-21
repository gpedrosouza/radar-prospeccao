# Deploy — Radar Prospecção

Guia completo para configurar e operar o pipeline de CI/CD e o ambiente de produção.

---

## Visão geral

```
PR aberto  →  test (CI gate)
                  ↓ (falha = PR bloqueado)
merge em main  →  test → build-and-push → deploy
                              ↓
                         GHCR (ghcr.io)
                              ↓
                        VPS via SSH
                    (migrate → up -d)
```

O workflow `.github/workflows/deploy.yml` tem três jobs:

| Job | Trigger | O que faz |
|---|---|---|
| `test` | PRs + push main | Sobe postgres/redis no runner, roda migrations, seed, lint, vitest |
| `build-and-push` | push main (após test) | Build multi-stage das imagens web e workers, push para GHCR |
| `deploy` | push main (após build) | SSH na VPS, pull imagens, migrations, `up -d` web+workers |

---

## Pré-requisitos na VPS

### Sistema operacional e ferramentas

```bash
# Ubuntu 22.04 LTS recomendado
apt update && apt install -y docker.io git

# Adicione o usuário deploy ao grupo docker (ou use sudo)
usermod -aG docker deploy
```

### Estrutura de diretórios

```bash
mkdir -p /opt/radar
cd /opt/radar

# Clone o repositório (necessário para git pull no deploy)
git clone https://github.com/SUA-ORG/radar-prospeccao.git .

# Copie e preencha o arquivo de variáveis de ambiente
cp .env.production.example .env.production
nano .env.production   # preencha TODOS os campos
```

### Inicialização manual (primeira vez)

```bash
cd /opt/radar

# Login no GHCR para poder puxar imagens privadas
echo "SEU_GHCR_TOKEN" | docker login ghcr.io -u SEU_USUARIO --password-stdin

# Baixa as imagens (após o primeiro push pelo CI)
docker compose --env-file .env.production -f docker-compose.prod.yml pull

# Sobe postgres e redis primeiro
docker compose --env-file .env.production -f docker-compose.prod.yml \
  up -d postgres redis

# Aguarda postgres ficar healthy (~15s) e então roda migrations
docker compose --env-file .env.production -f docker-compose.prod.yml \
  run --rm migrator

# Cria o usuário admin (apenas na primeira vez)
# Ajuste SEED_ADMIN_EMAIL e SEED_ADMIN_PASSWORD no .env.production antes de rodar
docker compose --env-file .env.production -f docker-compose.prod.yml \
  run --rm worker-export node -e "
    process.env.DATABASE_URL = process.env.DATABASE_URL;
  " 2>/dev/null || true
# Alternativa: rode o seed diretamente no host com acesso ao banco

# Sobe tudo
docker compose --env-file .env.production -f docker-compose.prod.yml up -d
```

> **Sobre o seed em produção:** Configure `SEED_ADMIN_EMAIL` e `SEED_ADMIN_PASSWORD` no
> `.env.production`, rode o seed uma vez, depois remova ou deixe os valores em branco.

---

## Secrets do GitHub

Configure em **Settings → Secrets and variables → Actions** do repositório:

| Secret | Descrição | Como obter |
|---|---|---|
| `SSH_HOST` | IP ou hostname da VPS | Painel do provedor de cloud |
| `SSH_USER` | Usuário SSH na VPS (ex: `deploy`, `ubuntu`) | Definido na criação da VPS |
| `SSH_PRIVATE_KEY` | Chave privada SSH (conteúdo do `~/.ssh/id_rsa`) | `cat ~/.ssh/id_rsa` no seu computador local |
| `GHCR_TOKEN` | PAT do GitHub com escopo `read:packages` | GitHub → Settings → Developer settings → Personal access tokens → Fine-grained → `read:packages` |

> **Por que dois tokens para GHCR?**
> O `GITHUB_TOKEN` automático tem `write:packages` no runner de CI (job `build-and-push`).
> A VPS precisa de um token separado (`GHCR_TOKEN`) com `read:packages` para puxar imagens.
> Um PAT com escopo mínimo reduz o raio de impacto se o token vazar.

### Configurando a chave SSH

Na VPS, adicione a chave pública ao usuário que o CI usará:

```bash
# Na VPS
mkdir -p ~/.ssh
echo "SUA_CHAVE_PUBLICA_ssh-rsa_AAA..." >> ~/.ssh/authorized_keys
chmod 700 ~/.ssh && chmod 600 ~/.ssh/authorized_keys
```

No GitHub, o secret `SSH_PRIVATE_KEY` deve conter o conteúdo **completo** da chave privada,
incluindo as linhas `-----BEGIN/END OPENSSH PRIVATE KEY-----`.

---

## Como testar o workflow manualmente

### Opção 1 — Simular um push para main

```bash
# Crie uma branch temporária, faça um commit vazio e abra um PR para main
git checkout -b test/ci-check
git commit --allow-empty -m "chore: test CI pipeline"
git push origin test/ci-check
# Ao fazer merge, o workflow completo dispara
```

### Opção 2 — Disparar apenas o job de deploy (sem rebuild)

Use o `workflow_dispatch` (adicionar ao workflow se necessário):
```yaml
on:
  workflow_dispatch:   # permite rodar manualmente pela UI do GitHub
```

Enquanto não estiver configurado, simule o deploy SSH diretamente:

```bash
ssh deploy@SUA_VPS_IP '
  set -euo pipefail
  cd /opt/radar
  git pull origin main
  docker compose --env-file .env.production -f docker-compose.prod.yml pull web worker-export
  docker compose --env-file .env.production -f docker-compose.prod.yml run --rm migrator
  docker compose --env-file .env.production -f docker-compose.prod.yml up -d --no-deps web worker-export caddy
'
```

### Opção 3 — Testar apenas o job `test` localmente

```bash
# Suba postgres e redis locais
docker compose up -d postgres redis

export DATABASE_URL="postgresql://radar:radar@localhost:5432/radar_db?schema=public"
export REDIS_URL="redis://localhost:6379"
export AUTH_SECRET="local-test-secret"
export AUTH_URL="http://localhost:3000"
export SEED_ADMIN_EMAIL="admin@test.local"
export SEED_ADMIN_PASSWORD="admin123"

npm ci
npm run db:generate --workspace=packages/db
npm run db:deploy --workspace=packages/db
npm run seed --workspace=packages/db
npm run lint
npm test --workspace=apps/web -- --run
```

---

## Estratégia de rollback

### Rollback automático (falha de migration)

O script de deploy usa `set -euo pipefail`. Se `docker compose run --rm migrator` falhar:

1. O script para imediatamente
2. `docker compose up -d` **nunca é executado**
3. Os containers existentes continuam rodando com a versão anterior
4. O job GitHub Actions marca o deploy como falho (vermelho)

**Nenhuma ação manual necessária** — a versão antiga permanece em produção.

### Rollback manual (após deploy com problema)

Se o deploy completou mas você identificou um bug na nova versão:

```bash
ssh deploy@SUA_VPS_IP

cd /opt/radar

# Lista as imagens disponíveis (tags sha-XXXXXXX)
docker images | grep radar

# Volta para uma imagem anterior específica
docker compose --env-file .env.production -f docker-compose.prod.yml \
  up -d --no-deps --no-recreate \
  -e "WEB_IMAGE=ghcr.io/sua-org/radar-web:sha-COMMIT_ANTERIOR" \
  web
```

Alternativa mais simples — edite temporariamente o `.env.production` na VPS:

```bash
# No .env.production, adicione/ajuste:
GHCR_IMAGE_PREFIX=ghcr.io/sua-org
# Depois mude a tag diretamente no docker-compose.prod.yml para sha-COMMIT
# ou faça revert do commit no GitHub e aguarde o CI redeploy
```

**A forma mais limpa:** faça `git revert` do commit problemático em main e deixe o
CI/CD fazer o deploy da versão revertida automaticamente.

### Rollback de migration (caso raro)

Prisma não tem down-migrations automáticas. Se uma migration causar problema:

1. Conecte ao postgres: `docker exec -it radar_postgres psql -U radar -d radar_db`
2. Inspecione o estado: `SELECT * FROM _prisma_migrations ORDER BY finished_at DESC LIMIT 5;`
3. Aplique o SQL inverso manualmente (reverter a alteração de schema)
4. Marque a migration como pendente ou resolva o conflito manualmente

---

## Monitoramento pós-deploy

```bash
# Status dos containers
docker compose --env-file .env.production -f docker-compose.prod.yml ps

# Logs em tempo real
docker compose --env-file .env.production -f docker-compose.prod.yml logs -f web
docker compose --env-file .env.production -f docker-compose.prod.yml logs -f worker-export

# Checar healthcheck
docker inspect --format='{{.State.Health.Status}}' radar_web

# Verificar certificado TLS (Caddy)
docker logs radar_caddy 2>&1 | grep -i "certificate\|tls\|acme"
```

---

## Variáveis que devem estar no .env.production da VPS

Além das variáveis documentadas em `.env.production.example`, garanta:

```bash
GHCR_IMAGE_PREFIX=ghcr.io/sua-org   # owner do GitHub onde as imagens são publicadas
```

`DATABASE_URL` e `REDIS_URL` **não precisam** estar no `.env.production` —
o `docker-compose.prod.yml` as injeta automaticamente usando os hostnames internos
Docker (`postgres`, `redis`) para garantir que os containers se encontrem na rede interna.

---

## Estrutura das imagens no GHCR

Após o primeiro deploy, as imagens estarão disponíveis em:

```
ghcr.io/SUA-ORG/radar-web:latest
ghcr.io/SUA-ORG/radar-web:sha-abc1234   ← tag de rastreabilidade por commit

ghcr.io/SUA-ORG/radar-workers:latest
ghcr.io/SUA-ORG/radar-workers:sha-abc1234
```

A VPS sempre puxa `:latest`. As tags `sha-*` servem para identificar exatamente
qual commit está rodando e para rollback manual quando necessário.

---

## Monitoramento Externo (UptimeRobot)

O endpoint `GET /api/health` é público (sem autenticação) e retorna:

- **200** `{"status":"ok","checks":{"database":"ok","redis":"ok"}}` — tudo saudável
- **503** `{"status":"degraded","checks":{...}}` — Postgres ou Redis fora

### Configurar monitor no UptimeRobot (gratuito)

1. Acesse [uptimerobot.com](https://uptimerobot.com) e crie uma conta gratuita.
2. Clique em **Add New Monitor**.
3. Preencha:
   | Campo | Valor |
   |---|---|
   | Monitor Type | `HTTP(s)` |
   | Friendly Name | `Radar API Health` |
   | URL | `https://SEU-DOMINIO/api/health` |
   | Monitoring Interval | `5 minutes` (plano gratuito) |
   | Monitor Timeout | `30 seconds` |

4. Em **Alert Contacts**, adicione seu e-mail. O UptimeRobot envia alerta quando o
   monitor fica fora e quando volta.

5. Clique em **Create Monitor**.

### Alerta por webhook (opcional — Slack, Discord, etc.)

1. Em **My Settings → Alert Contacts**, clique em **Add Alert Contact**.
2. Escolha **Webhook** e informe a URL do webhook do Slack/Discord/etc.
3. Associe o contato ao monitor criado acima.

### Verificar que está funcionando

Após criar o monitor, aguarde 1-2 minutos e confirme que ele aparece como **Up**
no dashboard. O histórico de uptime fica disponível publicamente se você ativar
a página de status em **Status Pages**.

### Alertas recomendados

- Alerta imediato por e-mail quando status mudar para **Down**.
- Alerta de recuperação quando voltar para **Up**.
- Configure pelo menos 2 contatos de alerta (e-mail principal + backup).
