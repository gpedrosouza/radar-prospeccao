# Prompt 27 — Webhook do Resend (Bounce, Complaint, Tracking)

> Fase: 5 — E-mail
> Pré-requisito: `26-integracao-resend-envio.md` concluído

---

## Prompt

```
Leia o CLAUDE.md na raiz do projeto.

Vamos implementar o endpoint que recebe webhooks do Resend, para manter as tabelas
EmailBounce/EmailUnsubscribe atualizadas automaticamente e rastrear métricas de campanha
(aberturas, cliques, respostas se usarmos o Inbound do Resend).

Crie a rota POST /api/webhooks/resend que:

1. Valida a assinatura do webhook (Resend assina os payloads — implemente a verificação
   conforme a documentação deles, NUNCA processe um webhook sem validar a assinatura, já que
   esse endpoint é público por natureza)

2. Trata os seguintes tipos de evento:
   - email.bounced: insere o e-mail em EmailBounce (com tipo hard/soft conforme o payload),
     atualiza o EmailRecipient correspondente (via resend_message_id) para status "bounced"
   - email.complained (marcado como spam pelo destinatário): trata como bounce permanente,
     insere em EmailBounce também — isso é crítico para manter a taxa de complaint baixa
   - email.delivered: atualiza EmailRecipient para "enviado" (confirmação de entrega)
   - email.opened: atualiza EmailRecipient para "aberto" (se ainda não estava em estado mais
     avançado como clicado)
   - email.clicked: atualiza EmailRecipient para "clicado"
   - (se Resend Inbound estiver configurado) email.received: associa a resposta recebida ao
     EmailRecipient original se possível (via matching de e-mail + campanha mais recente),
     atualiza para "respondido"

3. Depois de cada webhook processado, recalcula os totais agregados na EmailCampaign
   correspondente (total_bounces, etc.) — pode ser incremento direto ou recálculo, escolha
   a abordagem mais simples e correta

4. Retorna 200 rapidamente (o processamento pesado, se houver, deve ser assíncrono — mas como
   isso é só atualização de registros simples, provavelmente não precisa de fila aqui;
   avalie e decida)

Configure no .env.example a variável RESEND_WEBHOOK_SECRET (usada para validar a assinatura).

Não tenho um webhook real do Resend configurado neste ambiente — implemente o endpoint
completo e crie também um pequeno script de teste que simula payloads de cada tipo de evento
(com assinatura válida gerada localmente, usando o mesmo algoritmo que o Resend usa) para eu
poder validar a lógica sem depender de enviar e-mails reais.

Ao final, me dê o passo a passo de como configurar o webhook real no painel do Resend, apontando
para https://[dominio]/api/webhooks/resend.
```

## Após rodar este prompt
- Configure o webhook real no painel do Resend
- Teste com um envio real de baixo volume antes de qualquer campanha em escala
- Avance para `28-tela-campanha.md`
