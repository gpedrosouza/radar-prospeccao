# Guia de Configuração — Colocar o MVP no Ar (rodando na máquina local)

Domínio já registrado no Registro.com.br, Google Workspace ativo, conta Google Cloud com
faturamento ativo. Ajuste combinado: sem VPS por enquanto — a aplicação roda na sua máquina
local, exposta ao domínio via **Cloudflare Tunnel**, e os arquivos de exportação/backup ficam
em disco local em vez de R2. Este guia cobre DNS, o túnel, e-mail (SPF/DKIM/DMARC), API keys do
Google e Resend, e a ordem de configuração.

**Nota de arquitetura:** o `CLAUDE.md` do projeto define como regra inegociável que exportações
vão sempre para Cloudflare R2, nunca para disco local do container. Isso vale para produção real;
para essa fase local/pré-produção é razoável usar disco local, mas trate como decisão temporária
— quando for para produção de verdade (múltiplos usuários, jobs concorrentes, backup fora da sua
máquina), volte a usar R2 antes de ir ao ar oficialmente.

---

## 1. DNS e Cloudflare Tunnel — visão geral

Como o domínio vai apontar para sua máquina local (não um servidor público fixo), o caminho mais
simples é migrar o DNS para a **Cloudflare** (grátis) e usar o **Cloudflare Tunnel** — ele cria
uma conexão outbound da sua máquina para a borda da Cloudflare, sem precisar abrir porta no
roteador nem ter IP fixo.

1. Crie conta gratuita na Cloudflare (cloudflare.com) se ainda não tiver.
2. Add a Site → digite seu domínio → a Cloudflare escaneia os registros existentes (MX do
   Google Workspace deve ser detectado automaticamente).
3. Ela te dá 2 nameservers (ex. `ana.ns.cloudflare.com`, `bob.ns.cloudflare.com`) — vá no
   Registro.com.br, na área de DNS/Nameservers do domínio, e troque os nameservers padrão pelos
   da Cloudflare.
4. Aguarde a propagação (a Cloudflare avisa por e-mail quando o domínio fica ativo — costuma
   levar de alguns minutos a poucas horas).

### Registros que você vai precisar, no total

| Tipo | Finalidade |
|---|---|
| CNAME (gerado pelo túnel) | Apontar `radar.` para o Cloudflare Tunnel |
| TXT (SPF) | Autorizar Resend e Google Workspace a enviar e-mail em nome do domínio |
| CNAME (DKIM) | Assinatura criptográfica dos e-mails do Resend |
| TXT (DMARC) | Política de aplicação quando SPF/DKIM falham |
| MX | Roteamento de e-mail recebido — já detectado/mantido pela Cloudflare a partir do Google Workspace |

---

## 2. Configurar o Cloudflare Tunnel (expor a máquina local)

Com o domínio já na Cloudflare:

1. Instale o `cloudflared` na sua máquina (Windows: `winget install --id Cloudflare.cloudflared`,
   ou baixe o instalador em developers.cloudflare.com).
2. Autentique: `cloudflared tunnel login` — abre o navegador, escolha o domínio.
3. Crie o túnel nomeado: `cloudflared tunnel create radar-prospeccao` — gera um ID e um arquivo
   de credenciais.
4. Crie um arquivo de configuração (`config.yml`), típico:
   ```yaml
   tunnel: <TUNNEL_ID>
   credentials-file: C:\Users\Guilherme\.cloudflared\<TUNNEL_ID>.json
   ingress:
     - hostname: radar.grgestaofinanceira.com.br
       service: http://localhost:3000
     - service: http_status:404
   ```
5. Rotear o DNS para o túnel: `cloudflared tunnel route dns radar-prospeccao radar.grgestaofinanceira.com.br`
   — isso cria o CNAME automaticamente na zona Cloudflare.
6. Rodar o túnel: `cloudflared tunnel run radar-prospeccao` (deixe rodando enquanto o Next.js
   estiver ativo em `localhost:3000`; pode rodar como serviço do Windows depois com
   `cloudflared service install` se quiser que suba sozinho).

Com isso `https://radar.grgestaofinanceira.com.br` já serve HTTPS automático apontando para sua
máquina, sem precisar mexer em roteador/firewall.

---

## 3. SPF, DKIM, DMARC — autenticação de e-mail

Isso é obrigatório em 2026: Google, Yahoo e Microsoft rejeitam permanentemente tráfego de
remetentes em massa não autenticados. No seu caso, **Google Workspace** cuida de envios pontuais
feitos por pessoas e do recebimento de respostas (MX), enquanto **Resend** é quem faz todo o
envio em massa/transacional das campanhas do produto. O Resend atual usa um **subdomínio
dedicado (`send.`)** para autenticar seus envios, então ele **não** entra no SPF da raiz do
domínio — o SPF raiz continua só do Workspace, sem conflito.

### 3.1 SPF do domínio raiz (só Google Workspace)

```
Tipo: TXT
Nome: @ (raiz)
Valor: v=spf1 include:_spf.google.com ~all
```

- `~all` (softfail) é o padrão recomendado para começar; depois de validar que tudo funciona,
  pode evoluir para `-all` (hardfail, mais rígido).
- Esse registro cuida só dos e-mails enviados pelo Workspace. O Resend não usa esse registro.

### 3.2 DKIM + SPF do Resend (subdomínio `send.`)

No dashboard do Resend → Domains → Add Domain → `grgestaofinanceira.com.br`, ele mostra 3
registros para adicionar — copie os valores completos (sem cortar) exatamente como aparecem no
seu painel, os valores abaixo são só o formato, não os valores reais:

```
# DKIM (raiz do domínio)
Tipo: TXT
Nome: resend._domainkey
Valor: p=MIGfMA0GCSq... (chave pública completa, copie do seu dashboard)

# SPF do Resend (subdomínio dedicado, não mexe no SPF raiz)
Tipo: MX
Nome: send
Valor: feedback-smtp.<região>.amazonses.com
Prioridade: 10

Tipo: TXT
Nome: send
Valor: v=spf1 include:amazonses.com ~all
```

Se o domínio já estiver na Cloudflare (que é o seu caso), o Resend costuma oferecer um botão
**"Auto configure"** que cria os 3 registros direto via API — mais rápido e sem risco de erro de
digitação. Depois clique em "I've already added the records" para ele validar.

### 3.3 DMARC (um registro TXT em `_dmarc`)

```
Tipo: TXT
Nome: _dmarc
Valor: v=DMARC1; p=quarantine; rua=mailto:dmarc-reports@grgestaofinanceira.com.br; pct=100; adkim=r; aspf=r
```

- Comece com `p=quarantine` (e-mails que falham vão para spam, não são rejeitados) por 2–4
  semanas observando os relatórios `rua`.
- Depois de confirmar que SPF/DKIM passam consistentemente para Google Workspace e Resend,
  suba para `p=reject`.
- Crie a caixa `dmarc-reports@` (ou redirecione) para receber os relatórios agregados.

### 3.4 Verificação

No dashboard do Resend, a aba Domains mostra o status de cada registro (verde = verificado).
Para o Google Workspace, o Admin Console mostra "Autenticado" quando o DKIM está ativo. Rode:

```bash
dig TXT grgestaofinanceira.com.br | grep spf
dig TXT resend._domainkey.grgestaofinanceira.com.br
dig MX send.grgestaofinanceira.com.br
dig TXT send.grgestaofinanceira.com.br
dig TXT _dmarc.grgestaofinanceira.com.br
```

Propagação pode levar até 24h, mas normalmente é bem mais rápido.

---

## 4. Resend — configuração do produto

1. Crie a conta em resend.com (se ainda não tiver) usando o e-mail do Workspace.
2. Domains → Add Domain → `grgestaofinanceira.com.br` → siga os registros DNS do passo 3.2/3.3.
3. Depois de verificado, gere a API Key: API Keys → Create API Key → escopo "Sending access"
   (não precisa de acesso total). Copie o valor — só aparece uma vez.
4. Configure as variáveis de ambiente do projeto (conforme `CLAUDE.md`):
   - `RESEND_API_KEY` = a chave gerada
   - `RESEND_FROM_EMAIL` = ex. `contato@grgestaofinanceira.com.br` (precisa ser do domínio verificado)
5. Webhook: Resend → Webhooks → Add Endpoint → aponte para
   `https://radar.grgestaofinanceira.com.br/api/webhooks/resend` (rota já implementada no MVP, via
   Cloudflare Tunnel) →
   selecione os eventos de bounce/complaint/delivered/opened/clicked → copie o **Signing Secret**
   gerado e salve como `RESEND_WEBHOOK_SECRET`.
6. Gere também um segredo aleatório para `UNSUBSCRIBE_TOKEN_SECRET` (ex.
   `openssl rand -hex 32`) — usado para assinar os links de descadastro HMAC.

---

## 5. Google Cloud — API Keys (Maps + Places)

O projeto usa **Google Maps JS API** e **Google Places API**. Faça isso no mesmo projeto do
Google Cloud onde o faturamento já está ativo.

### 5.1 Habilitar as APIs

Console → APIs & Services → Library → habilite:
- **Maps JavaScript API**
- **Places API (New)** — é a versão nova, com endpoints diferentes da Places API legada;
  confirme no código do projeto qual versão os endpoints (`/api/places/companies`) esperam.
- (opcional, se usar geocodificação por endereço) **Geocoding API**

### 5.2 Criar as chaves — recomendado usar DUAS chaves separadas

Boa prática do próprio Google: uma chave por app/plataforma, cada uma restrita ao mínimo
necessário.

**Chave 1 — Frontend (Maps JS API, exposta no browser)**
1. Credentials → Create Credentials → API Key.
2. Renomeie para `radar-prospeccao-maps-frontend`.
3. Application restrictions → **HTTP referrers (websites)** → adicione:
   - `https://radar.grgestaofinanceira.com.br/*`
   - `http://localhost:3000/*` (para dev local)
4. API restrictions → **Restrict key** → selecione só `Maps JavaScript API`.
5. Salve. Esta é a chave pública, vai em `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` (ou nome equivalente
   usado no código do frontend).

**Chave 2 — Backend (Places API, chamada só server-side)**
1. Create Credentials → API Key novamente.
2. Renomeie para `radar-prospeccao-places-backend`.
3. Application restrictions → como sua máquina local não tem IP de saída fixo (residencial,
   muda com a operadora), a restrição por IP não é prática aqui. Deixe **"None"**, mas garanta
   que a chave NUNCA é exposta no client (só em variável de ambiente server-side, sem prefixo
   `NEXT_PUBLIC_`) — a API restriction abaixo já limita bastante o dano em caso de vazamento.
   Se seu IP residencial for fixo (contrato empresarial, por exemplo), prefira restringir por IP.
4. API restrictions → selecione `Places API (New)`.
5. Salve. Vai em `GOOGLE_PLACES_API_KEY` (server-side, sem exposição ao browser).

### 5.3 Cota e alertas de billing

Console → Billing → Budgets & Alerts → crie um orçamento (ex. R$200/mês) com alertas em 50%,
90%, 100% — evita surpresa de custo com Places API, que é cobrada por request.

---

## 6. Storage local (em vez de R2)

Exportações e backups vão para uma pasta local em disco em vez de um bucket R2:

- Crie uma pasta dedicada fora do repositório, ex. `C:\radar-prospeccao-storage\exports` e
  `C:\radar-prospeccao-storage\backups`.
- Ajuste o código que hoje assume upload S3-compatível (R2) para gravar em disco local — ou,
  se preferir não mexer no código, rode o **MinIO** localmente (já está no `docker-compose.yml`
  do projeto conforme o `CLAUDE.md`, usado em dev) e aponte as variáveis de storage para ele em
  vez de para R2. MinIO fala o protocolo S3, então o código de upload multipart não precisa
  mudar — só a URL/credenciais apontam para `localhost` em vez da Cloudflare.
- Faça backup manual periódico dessa pasta (ou do volume Docker do MinIO) para um HD externo ou
  outro serviço de sua escolha — sem R2, não há redundância automática fora da sua máquina.

## 7. Variáveis de ambiente — checklist final

Confirme que `apps/web/.env.local` tem tudo:

```
DATABASE_URL=
AUTH_SECRET=
AUTH_URL=https://radar.grgestaofinanceira.com.br
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=
GOOGLE_PLACES_API_KEY=
REDIS_URL=
RESEND_API_KEY=
RESEND_FROM_EMAIL=
RESEND_WEBHOOK_SECRET=
UNSUBSCRIBE_TOKEN_SECRET=
EMAIL_SEND_DELAY_MS=
APP_URL=https://radar.grgestaofinanceira.com.br
# Storage local via MinIO (em vez de R2)
S3_ENDPOINT=http://localhost:9000
S3_ACCESS_KEY_ID=
S3_SECRET_ACCESS_KEY=
S3_BUCKET_NAME=
```

`AUTH_SECRET` gere com `openssl rand -base64 32`. Ajuste os nomes das variáveis de storage
conforme o que o código do projeto já espera (`apps/workers` e o serviço de export usam essas
credenciais para o upload multipart).

---

## 8. Ordem sugerida para colocar no ar

1. Migrar DNS para Cloudflare (passo 1).
2. Instalar e configurar o Cloudflare Tunnel apontando para `localhost:3000` (passo 2).
3. SPF + DKIM (Google Workspace) + DKIM (Resend) + DMARC (passo 3) — pode ser feito em paralelo
   com o passo 2, propagação leva tempo.
4. Resend: verificar domínio, gerar API key, configurar webhook com a URL do túnel (passo 4).
5. Google Cloud: habilitar APIs, gerar as duas chaves restritas (passo 5).
6. Subir MinIO local via `docker compose up -d` (já previsto no projeto) e apontar as variáveis
   de storage para ele (passo 6).
7. Preencher todas as variáveis de ambiente (passo 7).
8. Rodar a migration: `npm run db:deploy --workspace=packages/db`.
9. Subir a aplicação local: `npm run dev --workspace=apps/web` (e os workers, se aplicável) e
   deixar o `cloudflared tunnel run` ativo.
10. Confirmar `/api/health` retornando 200 pelo domínio público (`https://radar.grgestaofinanceira.com.br/api/health`).
11. Enviar uma campanha de teste para um e-mail próprio e verificar SPF/DKIM/DMARC "pass" no
    cabeçalho recebido (Gmail → "Mostrar original").

---

Sources:
- [Resend SPF, DKIM, DMARC Configuration - Step-by-Step Guide](https://dmarcdkim.com/setup/how-to-setup-resend-spf-dkim-and-dmarc-records)
- [Implementing DMARC - Resend](https://resend.com/docs/dashboard/domains/dmarc)
- [How to set up SPF, DKIM and DMARC for Resend](https://dmarc.wiki/resend)
- [Set up the Places API (New) | Google for Developers](https://developers.google.com/maps/documentation/places/web-service/get-api-key)
- [Google Maps Platform security guidance](https://developers.google.com/maps/api-security-best-practices)
- [Set up the Maps JavaScript API | Google for Developers](https://developers.google.com/maps/documentation/javascript/get-api-key)
