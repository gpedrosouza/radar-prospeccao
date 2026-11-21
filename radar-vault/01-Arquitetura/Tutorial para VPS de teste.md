## Usando o PC como VPS de teste

A abordagem mais limpa no Windows é usar o **WSL2** (que o Docker Desktop já requer) como ambiente SSH. O deploy script roda em bash Linux nativo, com acesso direto ao Docker.

---

### Pré-requisitos

- Docker Desktop instalado e rodando
- WSL2 com Ubuntu (vem junto com Docker Desktop — confirme com `wsl -l -v` no PowerShell)
- Conta gratuita em [ngrok.com](https://ngrok.com/)

---

### Passo 1 — Habilitar integração Docker no WSL2

No Docker Desktop: **Settings → Resources → WSL Integration** → ative o toggle da distro Ubuntu → Apply & Restart.

Confirme dentro do WSL2:

```bash
wsl -d Ubuntu
docker version      # deve retornar Client + Server
docker compose version
```

---

### Passo 2 — Instalar e configurar o SSH server no WSL2

Dentro do terminal Ubuntu (WSL2):

```bash
sudo apt update && sudo apt install -y openssh-server

# Edita a config para garantir autenticação por chave
sudo nano /etc/ssh/sshd_config
```

Garanta que estas linhas estão presentes e sem `#`:

```
PubkeyAuthentication yes
AuthorizedKeysFile .ssh/authorized_keys
PasswordAuthentication no
```

Inicie o serviço:

```bash
sudo service ssh start

# Confirma que está rodando
sudo service ssh status
```

> WSL2 não tem systemd por padrão — `sudo service ssh start` precisa ser rodado toda vez que abrir o WSL2. Você pode adicionar ao final do `~/.bashrc` para automatizar.

---

### Passo 3 — Preparar o diretório do projeto

Ainda dentro do WSL2:

```bash
sudo mkdir -p /opt/radar
sudo chown $USER:$USER /opt/radar
cd /opt/radar

git clone https://github.com/SUA-ORG/radar-prospeccao.git .
```

Crie o `.env.production` (copie o exemplo e preencha os valores de teste):

```bash
cp .env.production.example .env.production
nano .env.production
```

Valores mínimos para o teste local funcionar:

```bash
GHCR_IMAGE_PREFIX=ghcr.io/SEU_USUARIO_GITHUB

DOMAIN=localhost
ACME_EMAIL=voce@email.com

POSTGRES_USER=radar
POSTGRES_PASSWORD=radar_local_test
POSTGRES_DB=radar_db
PG_SHARED_BUFFERS=256MB
PG_EFFECTIVE_CACHE_SIZE=512MB

REDIS_PASSWORD=redis_local_test

AUTH_SECRET=qualquer-string-longa-para-teste
AUTH_URL=http://localhost:3000
NEXT_PUBLIC_APP_URL=http://localhost:3000

SEED_ADMIN_EMAIL=admin@test.local
SEED_ADMIN_PASSWORD=admin123

# Preencha R2 e Google APIs quando tiver — deixe em branco por ora
R2_ENDPOINT=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET=radar-exports
R2_PUBLIC_URL=
CNPJ_EXPORT_PRESIGNED_URL_EXPIRY_HOURS=4
GOOGLE_PLACES_API_KEY=
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=
PLACES_CACHE_TTL_DAYS=30
```

---

### Passo 4 — Gerar o par de chaves SSH para o CI

No **PowerShell do Windows** (ou no terminal do seu computador principal):

```powershell
ssh-keygen -t ed25519 -C "github-actions-radar" -f "$HOME\.ssh\radar_deploy" -N '""'
```

Isso cria:

- `~\.ssh\radar_deploy` — chave privada (vai para o secret `SSH_PRIVATE_KEY`)
- `~\.ssh\radar_deploy.pub` — chave pública (vai para o WSL2)

**Adicione a chave pública ao WSL2:**

```bash
# No WSL2
mkdir -p ~/.ssh
chmod 700 ~/.ssh

# Cole o conteúdo de radar_deploy.pub:
echo "COLE_AQUI_O_CONTEUDO_DE_radar_deploy.pub" >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
```

Para ver o conteúdo da chave pública no PowerShell:

```powershell
Get-Content "$HOME\.ssh\radar_deploy.pub"
```

---

### Passo 5 — Instalar e configurar o ngrok

Dentro do WSL2:

```bash
# Baixa e instala o ngrok para Linux
curl -sSL https://ngrok-agent.s3.amazonaws.com/ngrok.asc \
  | sudo tee /etc/apt/trusted.gpg.d/ngrok.asc > /dev/null

echo "deb https://ngrok-agent.s3.amazonaws.com buster main" \
  | sudo tee /etc/apt/sources.list.d/ngrok.list

sudo apt update && sudo apt install -y ngrok
```

Conecte sua conta (token em [dashboard.ngrok.com/get-started/your-authtoken](https://dashboard.ngrok.com/get-started/your-authtoken)):

```bash
ngrok config add-authtoken SEU_TOKEN_AQUI
```

Inicie o túnel SSH:

```bash
ngrok tcp 22
```

A saída será algo como:

```
Forwarding  tcp://0.tcp.sa.ngrok.io:14823 -> localhost:22
```

Anote o **hostname** (`0.tcp.sa.ngrok.io`) e a **porta** (`14823`) — você vai precisar.

> Cada vez que reiniciar o ngrok, o hostname e a porta mudam. Atualize os secrets no GitHub quando isso acontecer.

---

### Passo 6 — Atualizar o workflow para suportar porta customizada

O `appleboy/ssh-action` aceita um parâmetro `port`. Edite o workflow para lê-lo de um secret:

```yaml
# .github/workflows/deploy.yml
# No job deploy, step "Deploy via SSH":
      - name: Deploy via SSH
        uses: appleboy/ssh-action@v1.0.3
        with:
          host: ${{ secrets.SSH_HOST }}
          username: ${{ secrets.SSH_USER }}
          key: ${{ secrets.SSH_PRIVATE_KEY }}
          port: ${{ secrets.SSH_PORT }}        # ← adicione esta linha
          envs: GHCR_TOKEN,GHCR_ACTOR
```

Na VPS real (porta 22 padrão), basta criar o secret `SSH_PORT` com valor `22`.

---

### Passo 7 — Configurar os secrets no GitHub

|Secret|Valor para teste no PC|
|---|---|
|`SSH_HOST`|hostname do ngrok (ex: `0.tcp.sa.ngrok.io`)|
|`SSH_USER`|seu usuário no WSL2 (resultado de `whoami` no WSL2)|
|`SSH_PRIVATE_KEY`|conteúdo completo de `~\.ssh\radar_deploy`|
|`SSH_PORT`|porta do ngrok (ex: `14823`)|
|`GHCR_TOKEN`|PAT com `read:packages` (igual ao de produção)|

Para ver a chave privada no PowerShell:

```powershell
Get-Content "$HOME\.ssh\radar_deploy"
```

Cole tudo, incluindo `-----BEGIN OPENSSH PRIVATE KEY-----`.

---

### Passo 8 — Testar a conexão SSH antes do CI

No **PowerShell**, confirme que o GitHub Actions conseguirá se conectar:

```powershell
ssh -i "$HOME\.ssh\radar_deploy" `
    -p PORTA_DO_NGROK `
    SEU_USUARIO@0.tcp.sa.ngrok.io `
    "cd /opt/radar && git status && docker version"
```

Se retornar a saída do `git status` e `docker version`, está tudo pronto.

---

### Passo 9 — Fazer o primeiro deploy de teste

Faça qualquer alteração no código, commit e push para `main`:

```bash
git add .
git commit -m "chore: test ci/cd pipeline"
git push origin main
```

Acompanhe em **GitHub → Actions**. A sequência esperada:

1. `test` — verde em ~3 minutos
2. `build-and-push` — verde em ~5–10 minutos (primeiro build é lento; subsequentes usam cache GHA)
3. `deploy` — verde em ~1–2 minutos

Se o `deploy` falhar com erro de SSH, as causas mais comuns são:

- ngrok reiniciou e o hostname/porta mudou → atualize `SSH_HOST` e `SSH_PORT`
- SSH server do WSL2 parou → `sudo service ssh start` no WSL2
- Chave pública não foi adicionada corretamente → verifique `~/.ssh/authorized_keys` no WSL2

---

### Checklist de reinicialização (toda vez que religar o PC)

```bash
# No WSL2
sudo service ssh start
ngrok tcp 22         # anote o novo hostname e porta
```

Atualize `SSH_HOST` e `SSH_PORT` no GitHub se mudaram.