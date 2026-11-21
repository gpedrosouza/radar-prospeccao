---
tags: [adr]
---

# ADR-002: Particionamento da tabela CompanyCnpj por UF desde a primeira migration

**Status:** aceito
**Data:** 2026-06

## Contexto
A v1 importou a base completa de CNPJs da Receita (~66M de registros) numa tabela flat única. O README da v1 já documentava que isso "talvez não tenha sido projetado para 66 milhões de registros". Particionar uma tabela já carregada com dezenas de milhões de linhas é uma operação cara e arriscada (geralmente exige reescrever a tabela inteira).

## Decisão
Criar a tabela `CompanyCnpj` já particionada por `LIST (uf)`, com 27 partições (uma por UF), desde a primeira migration do projeto — antes de qualquer importação de dados real.

## Alternativas consideradas
1. **Particionar por faixa de CNPJ (range)** — rejeitado: a maioria das buscas reais filtra por UF/cidade primeiro, então partição por UF alinha com o padrão de acesso real.
2. **Não particionar e confiar só em índices** — rejeitado: índices ajudam, mas não evitam que o planner tenha que considerar a tabela inteira; partição reduz drasticamente o espaço de busca físico para queries regionais, que são o caso de uso central do produto.
3. **Particionar depois, quando o volume justificar** — rejeitado: o custo de particionar depois (com a base já carregada) é ordens de magnitude maior que fazer certo desde o início.

## Consequências
- Toda query que filtra por UF se beneficia de pruning de partição automático do Postgres
- Restrição: chave primária precisa incluir a coluna de particionamento (`PRIMARY KEY (id, uf)`)
- Importação precisa ser UF-aware (script de importação direciona cada linha pra partição certa, automático via Postgres)
- Se no futuro for necessário também particionar por outro eixo (ex: situação cadastral), isso exigiria sub-particionamento — não necessário no MVP

## Links relacionados
- [[01-Arquitetura/Modelo-de-Dados]]
