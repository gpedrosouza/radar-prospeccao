# Prompt 26 — Integração com Resend para Envio de Campanhas

> Fase: 5 — E-mail
> Pré-requisito: `25-schema-campanhas-email.md` concluído

---

## Prompt

```
Leia o CLAUDE.md na raiz do projeto.

Vamos implementar o envio real das campanhas via Resend, seguindo o padrão de worker já
estabelecido (fila BullMQ, nunca processamento síncrono numa rota de API, pelo mesmo motivo
do worker de exportação: envio de milhares de e-mails não pode rodar numa requisição HTTP).

Crie:

1. Uma fila BullMQ "email-campaign" (mesmo padrão do "cnpj-export" já existente)

2. Em apps/web, a rota POST /api/campaigns/[id]/send que:
   - Valida que a campanha está em status "rascunho" ou "agendada"
   - Monta a lista final de destinatários (usando a função do prompt anterior que já exclui
     bounces/unsubscribes)
   - Enfileira UM job por campanha (não um job por e-mail — o worker é que vai iterar)
   - Atualiza status da campanha para "enviando"

3. Em apps/workers, o consumer da fila "email-campaign" que:
   - Itera pelos destinatários da campanha
   - Para cada um, substitui as variáveis do template ({{razao_social}}, {{cnae_descricao}},
     etc.) com os dados reais do CNPJ
   - Envia via SDK do Resend (from: o endereço configurado via RESEND_FROM_EMAIL, que deve
     ser do domínio próprio autenticado, NUNCA um Gmail ou domínio não verificado)
   - Aplica delay configurável entre envios (EMAIL_SEND_DELAY_MS, default 350ms) para não
     disparar tudo de uma vez e para respeitar boas práticas de reputação de remetente
   - Atualiza o registro EmailRecipient correspondente (status: enviado, resend_message_id)
   - Em caso de erro de envio, marca o destinatário como falha mas continua o restante da
     campanha (não aborta tudo por um erro individual)
   - Ao final, atualiza a campanha para status "concluida" e os totais (total_enviados,
     total_bounces ainda fica para o webhook do próximo prompt)

4. OBRIGATÓRIO: todo e-mail enviado deve incluir, no template, um link de descadastro em UM
   CLIQUE (sem necessidade de login ou confirmação adicional) — isso é exigência do Gmail/
   Yahoo para deliverability, não é opcional. Implemente a rota GET /api/unsubscribe?token=X
   (use um token assinado/criptografado, não o e-mail em texto puro na URL, por privacidade)
   que, ao ser acessada, insere o e-mail em EmailUnsubscribe e mostra uma página de confirmação
   simples.

Variáveis de ambiente novas: RESEND_API_KEY, RESEND_FROM_EMAIL, EMAIL_SEND_DELAY_MS,
UNSUBSCRIBE_TOKEN_SECRET

Não tenho uma conta Resend real configurada neste ambiente de teste — implemente tudo de forma
completa e me explique exatamente o passo a passo de configuração que preciso fazer no painel
do Resend (verificação de domínio, registros DNS a adicionar) antes do primeiro envio real
funcionar.
```

## Após rodar este prompt
- Configure o domínio real no Resend e valide SPF/DKIM/DMARC antes de qualquer envio de teste
- Avance para `27-webhook-bounce-unsubscribe.md`
