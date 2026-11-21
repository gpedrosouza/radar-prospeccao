---
tags: [arquitetura, infraestrutura, deploy]
---

# Infraestrutura e Deploy

## Decisão para o MVP: VPS única + Docker Compose

Recomendação baseada em orçamento de MVP (ver [[02-Custos/Custo-Mensal-Consolidado]]): **uma VPS robusta rodando tudo via Docker Compose**, não serviços gerenciados separados.

### Por quê
- Custo previsível e baixo (~$48–230/mês dependendo do tier escolhido) vs. soma de serviços gerenciados (Postgres gerenciado + Redis gerenciado + compute) que facilmente passa de $300/mês antes de qualquer tráfego real
- A separação lógica (web / worker-export / worker-enrichment / postgres / redis) já existe como containers Docker — migrar cada um para um serviço gerenciado depois é **mudança de infraestrutura, não de código**

### Quando migrar para serviços separados
- Quando o disco da VPS começar a ser disputado entre Postgres e os containers de aplicação (sinal: I/O wait alto)
- Quando precisar de múltiplas instâncias do `web` para alta disponibilidade
- Quando o volume de exportação justificar um worker dedicado em máquina própria

## Provedor recomendado para o MVP

DigitalOcean Droplet (CPU-Optimized ou General Purpose, 4–8 vCPU / 16–32GB RAM) é o equilíbrio mais previsível hoje — documentação extensa, billing por segundo, managed database disponível no mesmo provedor caso precise migrar só o banco no futuro sem trocar de provedor.

Alternativa mais barata (com mais trabalho operacional): VPS genérica (Contabo/OVH) com specs equivalentes — economiza, mas exige mais configuração manual de firewall, backups, etc.

> Nota: Hetzner subiu preços fortemente em 2026 (crise global de memória/SSD) — não é mais a opção mais barata como era antes. Reavaliar se os preços normalizarem.

## a) Requisitos mínimos da VPS

**Specs para 66M CNPJs (PostgreSQL + PostGIS):**

- **RAM**: 8GB mínimo (PostgreSQL precisa de `shared_buffers=2GB` + OS cache). 16GB é confortável.
- **vCPUs**: 4 (o PostgreSQL usa paralelismo em queries geoespaciais)
- **Disco**: 200GB SSD NVMe (os dados brutos da Receita + índices são ~80–120GB após import)
- **OS**: Ubuntu 24.04 LTS ou Debian 12

**Portas a abrir no firewall da VPS (somente estas três):**

```
22/tcp   SSH
80/tcp   HTTP  (Caddy redireciona para HTTPS automaticamente)
443/tcp  HTTPS (Caddy termina TLS e faz proxy para o Next.js)
```

PostgreSQL (5432) e Redis (6379) **não ficam expostos ao host** — só acessíveis dentro da rede Docker interna.

---

## b) Provisionar a VPS e instalar dependências

```bash
# Conectar na VPS
ssh root@IP_DA_VPS

# Atualizar sistema
apt update && apt upgrade -y

# Instalar Docker (script oficial)
curl -fsSL https://get.docker.com | sh

# Verificar instalação
docker --version          # Docker 27+
docker compose version    # Compose v2.x (sem hífen)

# Criar usuário de deploy não-root (opcional mas recomendado)
adduser deploy
usermod -aG docker deploy
```

**Apontar DNS antes de continuar:** Crie um registro A no seu provedor de DNS:

```
radar.suaempresa.com.br.  →  IP_DA_VPS
```

O Caddy só consegue obter o certificado TLS se o domínio já estiver resolvendo para a VPS.

---

## c) Clonar o repositório e configurar o ambiente

```bash
# Mudar para o usuário deploy (ou continuar como root)
su - deploy

# Clonar o repositório
git clone https://github.com/SEU_ORG/radar-prospeccao.git
cd radar-prospeccao

# Criar o arquivo de variáveis de produção a partir do exemplo
cp .env.production.example .env.production

# Editar com seus valores reais
nano .env.production
```

**Valores críticos que você precisa preencher:**

```bash
DOMAIN=radar.suaempresa.com.br     # sem https://
ACME_EMAIL=ti@suaempresa.com.br

POSTGRES_USER=radar
POSTGRES_PASSWORD=$(openssl rand -base64 32)   # gerar senha forte
POSTGRES_DB=radar_db

REDIS_PASSWORD=$(openssl rand -base64 24)

AUTH_SECRET=$(openssl rand -base64 32)         # OBRIGATÓRIO — assina JWTs
AUTH_URL=https://radar.suaempresa.com.br

# Cloudflare R2 (criar bucket antes)
R2_ENDPOINT=https://SEU_ACCOUNT_ID.r2.cloudflarestorage.com
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET=radar-exports
R2_PUBLIC_URL=https://pub-HASH.r2.dev

# Google APIs
GOOGLE_PLACES_API_KEY=AIza...
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=AIza...

# Admin inicial
SEED_ADMIN_EMAIL=admin@suaempresa.com.br
SEED_ADMIN_PASSWORD=SenhaInicial123!
```

> **Nota sobre `DATABASE_URL` e `REDIS_URL`:** não precisa definir no `.env.production` — o `docker-compose.prod.yml` os injeta automaticamente com os hostnames de serviço Docker (`postgres`, `redis`), sobrescrevendo qualquer valor do arquivo.

---

## d) Build e inicialização

```bash
# Na raiz do repositório, com .env.production preenchido:

# 1. Build das imagens (demora alguns minutos na primeira vez)
docker compose --env-file .env.production -f docker-compose.prod.yml build

# 2. Subir tudo em background
docker compose --env-file .env.production -f docker-compose.prod.yml up -d

# 3. Acompanhar os logs durante a inicialização
docker compose -f docker-compose.prod.yml logs -f
# Aguardar: "radar_postgres", "radar_redis" ficam healthy, depois "radar_web"

# 4. Aplicar as migrations do banco (somente na primeira vez)
docker compose -f docker-compose.prod.yml exec web \
  node -e "require('child_process').execSync('npx prisma migrate deploy', {stdio:'inherit', cwd:'/app/apps/web'})"
```

**Alternativa para as migrations** (mais confiável): rodar de fora do container com `DATABASE_URL` apontando para `localhost:5432` (temporariamente exposto) ou usar um container temporário:

```bash
# Opção mais simples: rodar migrations via npm na VPS com a DATABASE_URL local
DATABASE_URL="postgresql://radar:SENHA@localhost:5432/radar_db?schema=public" \
  npm run db:deploy --workspace=packages/db
```

Para isso funcionar, adicione temporariamente `ports: ["5432:5432"]` ao serviço postgres, rode as migrations, depois remova.

```bash
# 5. Criar o usuário admin inicial (somente uma vez)
docker compose --env-file .env.production -f docker-compose.prod.yml exec web \
  node -e "
    const {execSync}=require('child_process');
    execSync('npm run seed --workspace=packages/db',{stdio:'inherit',env:{...process.env}});
  "
```

---

## e) Verificar que tudo subiu corretamente

```bash
# 1. Status de todos os containers
docker compose -f docker-compose.prod.yml ps
# Todos devem estar "healthy" (exceto worker-export que não tem healthcheck)

# 2. Checar o PostgreSQL
docker exec radar_postgres psql -U radar -d radar_db -c "SELECT PostGIS_Version();"
# → 3.4.x USE_GEOS=1 ...

docker exec radar_postgres psql -U radar -d radar_db -c "SHOW shared_buffers;"
# → 2GB (ou o valor configurado)

# 3. Checar o Redis
docker exec radar_redis redis-cli -a REDIS_PASSWORD ping
# → PONG

# 4. Checar o Next.js (internamente)
docker exec radar_web wget -qO- http://localhost:3000/api/health
# → {"status":"ok"} ou similar

# 5. Checar HTTPS via Caddy (externamente, após DNS propagar)
curl -I https://radar.suaempresa.com.br
# → HTTP/2 200  (com certificado Let's Encrypt válido)

# 6. Checar os logs do Caddy para ver se o TLS foi obtido com sucesso
docker logs radar_caddy 2>&1 | grep -E "(certificate|tls|error)"
# Deve aparecer: "certificate obtained successfully"

# 7. Checar logs dos workers
docker logs radar_worker_export --tail=20
# Deve aparecer: "aguardando jobs na fila cnpj-export..."
```

---

## Operações recorrentes

```bash
# Atualizar para uma nova versão do código
git pull
docker compose --env-file .env.production -f docker-compose.prod.yml build
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --no-deps web worker-export

# Ver logs em tempo real de um serviço específico
docker logs radar_web -f --tail=100

# Backup manual do banco
docker exec radar_postgres pg_dump -U radar radar_db | gzip > backup_$(date +%Y%m%d).sql.gz

# Restart de um serviço sem derrubar os outros
docker compose -f docker-compose.prod
```
## docker-compose.yml — estrutura conceitual

```yaml
services:
  web:
    build: ./apps/web
    env_file: .env
    depends_on: [postgres, redis]
    ports: ["3000:3000"]

  worker-export:
    build: ./apps/workers
    command: node dist/export-worker.js
    env_file: .env
    depends_on: [postgres, redis]

  worker-enrichment:
    build: ./apps/workers
    command: node dist/enrichment-worker.js
    env_file: .env
    depends_on: [postgres, redis]

  postgres:
    image: postgis/postgis:16-3.4
    volumes: ["pgdata:/var/lib/postgresql/data"]
    env_file: .env

  redis:
    image: redis:7-alpine
    volumes: ["redisdata:/data"]

  caddy:                      # reverse proxy + HTTPS automático
    image: caddy:2
    ports: ["80:80", "443:443"]
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile
      - caddy_data:/data

volumes:
  pgdata:
  redisdata:
  caddy_data:
```

## Configurando os Secrets no GitHub

### 1. Acessar a tela de secrets

1. Acesse o repositório no GitHub
2. Clique em **Settings** (aba no topo)
3. No menu lateral esquerdo: **Security → Secrets and variables → Actions**
4. Clique em **New repository secret** para cada secret abaixo

---

### 2. `SSH_HOST`

**Value:** IP público da VPS (ex: `203.0.113.42`) ou hostname (ex: `radar.suaempresa.com.br`)

---

### 3. `SSH_USER`

**Value:** nome do usuário SSH na VPS (ex: `ubuntu`, `deploy`, `root`)

Para descobrir qual é o seu:

```bash
ssh SUA_VPS_IP whoami
```

---

### 4. `SSH_PRIVATE_KEY`

Gere um par de chaves dedicado para o CI (não reutilize a sua chave pessoal):

```bash
# No seu computador local
ssh-keygen -t ed25519 -C "github-actions-radar" -f ~/.ssh/radar_deploy -N ""
```

Isso cria dois arquivos:

- `~/.ssh/radar_deploy` — chave privada (vai para o secret)
- `~/.ssh/radar_deploy.pub` — chave pública (vai para a VPS)

**Na VPS**, adicione a chave pública:

```bash
echo "CONTEUDO_DO_radar_deploy.pub" >> ~/.ssh/authorized_keys
```

**No GitHub**, o valor do secret é o conteúdo **completo** da chave privada:

```bash
# No seu computador local
cat ~/.ssh/radar_deploy
```

Cole tudo, incluindo as linhas `-----BEGIN OPENSSH PRIVATE KEY-----` e `-----END OPENSSH PRIVATE KEY-----`.

---

### 5. `GHCR_TOKEN`

Este token permite que a VPS puxe (`docker pull`) as imagens do GHCR.

1. GitHub → clique na sua foto (canto superior direito) → **Settings**
2. Menu lateral: **Developer settings** (no final)
3. **Personal access tokens → Tokens (classic)**
4. **Generate new token (classic)**
5. Configure:
    - **Note:** `radar-vps-ghcr-read`
    - **Expiration:** 90 days (ou sem expiração, a seu critério)
    - **Scopes:** marque apenas `read:packages`
6. Clique em **Generate token** e copie o valor imediatamente (aparece só uma vez)

---

### Verificar que está tudo certo

Após criar os 4 secrets, a tela de Actions secrets deve mostrar:

```
SSH_HOST          Updated X minutes ago
SSH_USER          Updated X minutes ago
SSH_PRIVATE_KEY   Updated X minutes ago
GHCR_TOKEN        Updated X minutes ago
```

---

### Teste rápido antes do primeiro merge

Valide a conexão SSH e o token GHCR manualmente antes de depender do CI:

```bash
# Testa a chave SSH
ssh -i ~/.ssh/radar_deploy SEU_USER@SUA_VPS_IP "echo 'SSH OK'"

# Testa o GHCR token (substitua SEU_USUARIO e SEU_TOKEN)
echo "SEU_TOKEN" | docker login ghcr.io -u SEU_USUARIO --password-stdin
```

Se ambos retornarem sucesso, o pipeline vai funcionar.
## CI/CD

GitHub Actions (mantido da v1):
1. **Em PR:** lint + typecheck + testes (Vitest)
2. **Em merge para `main`:** build das imagens Docker → push para registry → SSH na VPS → `docker compose pull && docker compose up -d`

Para o MVP, deploy via SSH script simples é suficiente. Não introduzir Kubernetes/ArgoCD nesse estágio.

## Backups

- `pg_dump` automatizado via cron dentro da VPS, enviado para o mesmo bucket R2 (separado dos exports de usuário)
- Testar restauração pelo menos uma vez antes de considerar o MVP "em produção de verdade"

## Monitoramento mínimo viável

- Logs dos containers via `docker compose logs` centralizados (ou Better Stack/Axiom no tier gratuito)
- Healthcheck simples em `/api/health` consultado por um serviço externo gratuito (ex: UptimeRobot) para alertar se o app cair

## Links relacionados
- [[01-Arquitetura/Arquitetura-Geral]]
- [[02-Custos/Custo-Mensal-Consolidado]]
- [[03-Fases-Desenvolvimento/Fase-0-Fundacao]]
