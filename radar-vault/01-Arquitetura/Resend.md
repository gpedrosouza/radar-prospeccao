### Como configurar no painel do Resend

1. Acesse **resend.com** → **Webhooks** → **Add Endpoint**
2. URL: `https://[seu-dominio]/api/webhooks/resend`
3. Eventos a habilitar: `email.sent`, `email.delivered`, `email.bounced`, `email.complained`, `email.opened`, `email.clicked`, `email.received`
4. Após criar, copie o **Signing Secret** (formato `whsec_...`) e adicione como `RESEND_WEBHOOK_SECRET` no `.env.local` (dev) ou variáveis de produção
5. Para testar localmente com ngrok: `ngrok http 3000` → use a URL gerada no passo 2

### Como rodar o script de teste

```bash
# Requer app rodando e RESEND_WEBHOOK_SECRET no ambiente
RESEND_WEBHOOK_SECRET=whsec_... npx tsx apps/workers/src/scripts/test-resend-webhook.ts
```