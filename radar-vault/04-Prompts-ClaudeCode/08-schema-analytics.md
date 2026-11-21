# Prompt 08 — Schema Analytics e Tabelas Resumo

> Fase: 1 — Dados
> Pré-requisito: `07-indices-e-analyze.md` concluído

---

## Prompt

```
Leia o CLAUDE.md na raiz do projeto. Uma das regras inegociáveis é: nenhuma query de UI agrega
direto sobre CompanyCnpj — agregações usam um schema separado chamado `analytics`.

Preciso que você:

1. Crie uma migration SQL manual que cria o schema `analytics`
2. Dentro dele, crie as seguintes tabelas resumo (como tabelas normais, não materialized views,
   para terem controle total de quando atualizar):
   - analytics.cnpj_summary_by_uf (uf, total, total_ativas, total_com_email, atualizado_em)
   - analytics.cnpj_summary_by_cnae (cnae_principal, descricao, total, atualizado_em)
   - analytics.cnpj_summary_by_status (situacao, total, atualizado_em)
   - analytics.cnpj_summary_by_size (porte, total, atualizado_em)
   - analytics.refresh_log (id, tabela, linhas_processadas, duracao_ms, executado_em)

3. Crie um script SQL (analytics/refresh-cnpj-summaries.sql, ou em apps/workers se preferir
   centralizar scripts lá) que recalcula essas tabelas a partir de CompanyCnpj, registrando
   cada execução em refresh_log

4. Crie um comando npm (npm run analytics:refresh) que executa esse SQL

5. Importante: este refresh varre a tabela bruta inteira, então NÃO deve ser chamado por
   nenhuma rota de API ou trigger automático — é uma rotina manual ou agendada via cron,
   fora do caminho crítico da aplicação. Documente isso claramente no comentário do script.

Depois de criar tudo, rode o refresh com os dados de teste que já temos carregados e confirme
que as tabelas analytics.* foram populadas corretamente.
```

## Após rodar este prompt
- Confirme que nenhuma rota de API criada futuramente vai tentar agregar direto sobre CompanyCnpj
- Avance para `09-geocodificacao-lote.md`
