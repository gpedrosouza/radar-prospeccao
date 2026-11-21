# Prompt 25 — Schema de Campanhas de E-mail

> Fase: 5 — E-mail
> ⚠️ BLOQUEIO: não inicie esta fase sem validação jurídica/compliance concluída.
> Ver [[03-Fases-Desenvolvimento/Fase-5-Email]] e [[01-Arquitetura/Seguranca-e-Auth]]
> Pré-requisito técnico: Fase 4 completa + domínio com SPF/DKIM/DMARC configurados
> (ver [[02-Custos/Email-Dominio-Deliverability]])

---

## Prompt

```
Leia o CLAUDE.md na raiz do projeto.

[CONFIRME ANTES DE EXECUTAR: a validação jurídica sobre uso do e-mail da Receita Federal para
fins comerciais foi concluída e aprovada? Se não, pare aqui e não prossiga com este prompt.]

Vamos criar o schema de dados para campanhas de e-mail. Regras de conformidade que precisam
estar refletidas na modelagem desde o início:
- Nunca enviar para endereço que já recebeu bounce permanente ou pediu descadastro
- Toda campanha precisa rastrear quem a criou e quando
- Taxa de bounce/complaint precisa ser monitorável

Adicione ao schema Prisma (packages/db):

**EmailCampaign**:
- id (uuid), nome, usuario_id (fk User), filtros_origem (jsonb — os filtros de CNPJ que
  geraram a base de destinatários), assunto, corpo_template (text, com variáveis tipo
  {{razao_social}}), status (rascunho/agendada/enviando/concluida/falhou),
  total_destinatarios (int), total_enviados (int), total_bounces (int), criado_em, enviado_em

**EmailRecipient** (cada destinatário individual de uma campanha, para rastreabilidade):
- id (uuid), campaign_id (fk EmailCampaign), cnpj (referência ao CompanyCnpj, não FK rígida
  pois CompanyCnpj é particionada — considere se vale guardar uf+cnpj ou só o e-mail+cnpj
  como string, documente sua escolha), email, status (pendente/enviado/bounced/aberto/
  clicado/respondido), enviado_em, resend_message_id (para correlacionar com webhooks)

**EmailBounce**:
- id, email (único), tipo (hard/soft), motivo, criado_em
- Regra: qualquer e-mail aqui NUNCA deve ser destinatário de uma nova campanha

**EmailUnsubscribe**:
- id, email (único), campaign_id_origem (fk, opcional), criado_em
- Regra: qualquer e-mail aqui NUNCA deve ser destinatário de uma nova campanha,
  permanentemente, sem exceção

Implemente também, na camada de service (apps/web/src/server/services/email-campaign.service.ts):
- Uma função que, ao montar a lista de destinatários de uma nova campanha a partir dos filtros
  de CNPJ, EXCLUI automaticamente qualquer e-mail presente em EmailBounce ou EmailUnsubscribe
  — isso não pode ser uma checagem opcional, deve ser parte obrigatória do fluxo de criação

Escreva um teste Vitest que comprova: um e-mail presente em EmailUnsubscribe nunca aparece na
lista de destinatários de uma campanha nova, mesmo que o CNPJ dele bata com os filtros.
```

## Após rodar este prompt
- Confirme novamente que o bloqueio jurídico foi resolvido antes de avançar
- Avance para `26-integracao-resend-envio.md`
