---
tags: [visao, produto]
---

# Visão Geral — Radar de Prospecção Geográfica

## O que é

Ferramenta interna para que **personal bankers** prospectem ativamente empresas (CNPJs) dentro de uma região geográfica definida, cruzando:

1. **Dados oficiais da Receita Federal** (base completa de CNPJs do Brasil, ~66M de registros, atualizada mensalmente)
2. **Google Places** (o que existe "no mapa" hoje, sinal de atividade real)
3. **Geolocalização por raio** a partir de uma origem (cidade, endereço ou empresa)

E permite, a partir do resultado filtrado:
- Exportar a base completa (CSV/XLSX) para uso externo
- Disparar campanhas de e-mail segmentadas diretamente para os CNPJs encontrados

## Por que existe

Personal bankers hoje prospectam de forma manual e não-sistemática — caminhando por uma região, ou usando listas genéricas sem filtro de relevância (situação cadastral, porte, CNAE, regime tributário). O Radar resolve isso ao permitir que o banker desenhe uma região no mapa e receba, em segundos, uma lista qualificada e exportável de empresas-alvo.

## Para quem

- **Usuário primário:** Personal banker (campo, sem perfil técnico)
- **Usuário secundário:** Gestor regional (acompanha campanhas e resultados)
- **Fora de escopo (por ora):** Cliente final (CNPJ) não interage com o sistema

## Princípio de design central

> **O sistema deve se sentir leve mesmo sendo, por baixo, um sistema que lida com 66 milhões de registros.**

Isso significa: nenhuma tela do usuário final dispara uma query pesada em tempo real sobre a base bruta. Tudo que é pesado roda em background (workers), é pré-agregado (tabelas analíticas), ou é paginado por cursor.

## Diferença fundamental vs. a v1 (repositório antigo)

A v1 cresceu organicamente e acumulou tudo numa única aplicação Next.js: UI, API, workers, scripts de importação. Funcionou como prova de conceito, mas não escala nem em performance nem em manutenção.

A v2 (este plano) separa desde o primeiro commit:
- **Web** (Next.js — só UI e API fina)
- **Workers** (Node standalone — exportação, enriquecimento, e-mail)
- **Banco** (Postgres particionado, schema analítico separado)
- **Fila** (Redis + BullMQ, não tabela com polling)

Ver [[01-Arquitetura/Arquitetura-Geral]] para detalhes.

## Links relacionados
- [[00-Visao/Personas-e-Jornada]]
- [[00-Visao/Escopo-MVP]]
- [[01-Arquitetura/Arquitetura-Geral]]
