# Prompt 11 — BullMQ + Redis Setup

> Fase: 2 — Core
> Pré-requisito: `10-camada-services-repositories.md` concluído
> Contexto de decisão: ver [[05-Decisoes-ADR/ADR-003-BullMQ-vs-Tabela-Jobs]]

---

## Prompt

```
Leia o CLAUDE.md na raiz do projeto.

Vamos substituir o padrão de "tabela com polling" por uma fila real usando BullMQ sobre Redis,
para os jobs de exportação de CNPJ. A tabela CnpjExportJob (já existe no schema) continua
existindo, mas agora como espelho de auditoria/histórico — o BullMQ é quem efetivamente
coordena o processamento entre workers.

Em packages/shared, crie:
- Definição de tipos para o payload do job de exportação (filtros + usuarioId + exportJobId)

Em apps/web/src/server, crie:
- queue/export-queue.ts: configura e exporta a fila BullMQ "cnpj-export" (conexão Redis via
  REDIS_URL do ambiente)
- No export.service.ts (já criado no prompt anterior), adicione a função que:
  1. Cria o registro na tabela CnpjExportJob (status: queued)
  2. Enfileira o job no BullMQ com o ID do registro criado
  3. Retorna o ID imediatamente (não espera o processamento)

Em apps/workers, crie:
- src/queues/export-queue-consumer.ts: um Worker do BullMQ que consome a fila "cnpj-export"
  (a lógica de DE FATO processar o export — paginar, gerar CSV, subir pro R2 — vamos
  implementar no próximo prompt; por agora, faça o consumer já estruturado, atualizando o
  status da CnpjExportJob para "running" ao iniciar e tendo um placeholder claro de onde a
  lógica de geração de arquivo vai entrar)
- Configure retry (3 tentativas, backoff exponencial) e um listener de eventos 'failed' que
  atualiza o status para "failed" e grava o erro na tabela

Crie também um Dockerfile básico para apps/workers (se ainda não existir) e adicione o serviço
worker-export ao docker-compose.yml, apontando para esse consumer.

Teste o fluxo: enfileire um job de teste manualmente (script ou via API temporária), confirme
que o worker pega o job, atualiza o status para "running", e (mesmo sem lógica real ainda)
finaliza marcando como "completed" para validar que a esteira funciona ponta a ponta.
```

## Após rodar este prompt
- Confirme visualmente (logs do worker) que o ciclo queued → running → completed funciona
- Avance para `12-worker-export-r2.md`
