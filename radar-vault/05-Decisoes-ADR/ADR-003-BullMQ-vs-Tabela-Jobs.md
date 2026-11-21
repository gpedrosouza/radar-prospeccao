---
tags: [adr]
---

# ADR-003: BullMQ + Redis em vez de tabela com polling para jobs assíncronos

**Status:** aceito
**Data:** 2026-06

## Contexto
A v1 implementava jobs de exportação e enriquecimento via uma tabela (`CnpjExportJob`/`CnpjExternalEnrichmentJob`) consultada por polling, com transição de status `queued -> running` funcionando como lock otimista no banco. Funcional, mas frágil sob carga: sem retry automático nativo, sem dead-letter, sem visibilidade de fila.

## Decisão
Usar BullMQ (sobre Redis) como fila real para jobs de exportação e enriquecimento. A tabela no Postgres continua existindo, mas como espelho de auditoria/histórico para a UI — não como mecanismo de coordenação entre workers.

## Alternativas consideradas
1. **Manter só a tabela com polling, melhorando o lock** — rejeitado: continuaria sem retry automático, backoff, ou dashboard de operação sem construir isso à mão.
2. **SQS/serviço de fila gerenciado de cloud** — rejeitado para o MVP: acopla a um provedor específico de cloud; Redis é portável e já seria necessário para outros usos (cache) eventualmente.

## Consequências
- Ganha retry automático, backoff exponencial, dead-letter queue, e dashboard (Bull Board) sem código extra
- Adiciona Redis como nova peça de infraestrutura (mitigado: já estava no roadmap como cache de Places também)
- Workers (`apps/workers`) consomem a fila; a tabela no Postgres é atualizada pelo worker para refletir progresso, e é isso que a UI consulta/recebe via SSE

## Links relacionados
- [[01-Arquitetura/Arquitetura-Geral]]
- [[03-Fases-Desenvolvimento/Fase-2-Core]]
