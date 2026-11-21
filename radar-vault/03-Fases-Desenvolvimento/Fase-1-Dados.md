---
tags: [fase, dados]
status: nao-iniciada
---

# Fase 1 — Dados

**Objetivo:** ter a base da Receita Federal importada corretamente na estrutura particionada, com índices, schema analítico, e geocodificação funcionando sob demanda (não em massa).

## Entregáveis

1. Script de importação em `apps/workers` (nunca em `apps/web`) usando `COPY` nativo do Postgres (`pg-copy-streams`), não INSERT em lote
2. Importação testável com `RECEITA_IMPORT_MAX_ROWS` (amostra pequena antes da carga real)
3. Índices parciais e compostos criados (ver [[01-Arquitetura/Modelo-de-Dados]])
4. Schema `analytics` com pelo menos: `cnpj_summary_by_uf`, `cnpj_summary_by_cnae`, `cnpj_summary_by_status`
5. Script de geocodificação em lote (sob demanda, com limite configurável, nunca a base toda automaticamente)
6. Importação de cidades/distritos (mantém lógica da v1, mas roda em `apps/workers`)

## Critério de saída

- [ ] Importação de uma amostra (1.000 linhas) funciona ponta a ponta
- [ ] `ANALYZE` executado após carga
- [ ] Uma query de filtro básico (UF + situação + CNAE) responde em menos de 500ms com a base completa carregada
- [ ] Tabelas `analytics.*` populadas e consultáveis
- [ ] Metabase (ou equivalente) conectado ao schema `analytics`, nunca direto na tabela bruta

## Atenção
Carga completa pode levar horas. Nunca interromper a máquina durante a carga. Rodar por etapas (`RECEITA_IMPORT_ONLY=dictionaries`, depois `empresas`, `simples`, `socios`, `estabelecimentos`, nessa ordem).

## Prompts relacionados (em ordem)
1. `04-Prompts-ClaudeCode/06-importador-receita-copy.md`
2. `04-Prompts-ClaudeCode/07-indices-e-analyze.md`
3. `04-Prompts-ClaudeCode/08-schema-analytics.md`
4. `04-Prompts-ClaudeCode/09-geocodificacao-lote.md`

## Links relacionados
- [[01-Arquitetura/Modelo-de-Dados]]
- [[03-Fases-Desenvolvimento/Fase-0-Fundacao]]
