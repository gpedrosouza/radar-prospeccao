---
tags: [fase, email, lgpd]
status: nao-iniciada
---

# Fase 5 — Campanhas de E-mail

**Objetivo:** disparo de e-mail segmentado para os CNPJs resultantes da busca, com conformidade e deliverability corretas desde o início.

> ⚠️ **Bloqueio externo:** esta fase não deve começar sem validação jurídica/compliance do uso do e-mail da Receita Federal para fins de prospecção comercial. Isso não é um bloqueio técnico — é uma decisão do banco. Ver [[01-Arquitetura/Seguranca-e-Auth]].

## Pré-requisitos (fora do código)
- [x] Domínio registrado
- [ ] DNS configurado: SPF, DKIM, DMARC (ver [[02-Custos/Email-Dominio-Deliverability]])
- [ ] Decisão de qual e-mail recebe respostas (recomendado: e-mail corporativo do banker)
- [ ] Validação jurídica concluída

## Entregáveis

1. Tabelas `EmailCampaign`, `EmailBounce`, `EmailUnsubscribe`
2. Integração com Resend (envio) com rate limiting configurável (delay entre envios)
3. Template de e-mail com variáveis (`{{razao_social}}`, `{{cnae_descricao}}`, etc.)
4. Link de descadastro funcional em um clique, processado em até 48h
5. Webhook do Resend para tracking de bounce/complaint, atualizando as tabelas de supressão automaticamente
6. Tela de campanha (já desenhada no design): formulário + variáveis + aviso LGPD + estatísticas de campanhas anteriores
7. (Opcional) Resend Inbound configurado para popular métrica de resposta automaticamente

## Critério de saída

- [ ] Envio de teste para endereço próprio chega na caixa de entrada (não spam) com SPF/DKIM/DMARC válidos
- [ ] Descadastro funciona e a tabela de supressão é respeitada em envios futuros
- [ ] Taxa de bounce/complaint monitorada e visível
- [ ] Nenhum envio ocorre para endereço em `EmailBounce` ou `EmailUnsubscribe`

## Prompts relacionados (em ordem)
1. `04-Prompts-ClaudeCode/25-schema-campanhas-email.md`
2. `04-Prompts-ClaudeCode/26-integracao-resend-envio.md`
3. `04-Prompts-ClaudeCode/27-webhook-bounce-unsubscribe.md`
4. `04-Prompts-ClaudeCode/28-tela-campanha.md`

## Links relacionados
- [[02-Custos/Email-Dominio-Deliverability]]
- [[01-Arquitetura/Seguranca-e-Auth]]
