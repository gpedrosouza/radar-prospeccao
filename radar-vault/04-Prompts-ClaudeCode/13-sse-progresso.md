# Prompt 13 — SSE para Progresso de Jobs em Tempo Real

> Fase: 2 — Core
> Pré-requisito: `12-worker-export-r2.md` concluído

---

## Prompt

```
Leia o CLAUDE.md na raiz do projeto.

Preciso de um endpoint Server-Sent Events (SSE) em apps/web que permita ao frontend acompanhar
o progresso de um job de exportação em tempo real, sem precisar fazer polling manual repetido.

Crie a rota: apps/web/src/app/api/cnpj/export-jobs/[id]/stream/route.ts

Comportamento esperado:
1. Ao conectar, a rota deve consultar o status atual do job (via export.service) e enviar
   imediatamente o estado atual como primeiro evento
2. Depois, deve continuar enviando eventos sempre que o progresso mudar — como o worker atualiza
   a tabela CnpjExportJob diretamente (não há pub/sub nativo nessa atualização ainda), implemente
   um mecanismo de polling INTERNO do servidor (ex: a cada 1-2 segundos, a própria rota consulta
   o banco e só emite um evento SSE se o progresso mudou desde a última checagem) — isso é
   diferente de fazer o FRONTEND fazer polling; aqui é o servidor que poll a cada conexão SSE
   ativa, e push pro cliente só quando há mudança real
3. Quando o status chegar a "completed" ou "failed", envia o evento final com a URL de download
   (se completed) ou a mensagem de erro (se failed), e encerra a conexão
4. Trate desconexão do cliente corretamente (limpe o interval/timeout ao desconectar)

Formato do evento SSE, como JSON:
{ "status": "running", "progresso_pct": 42, "linhas": 18234 }
{ "status": "completed", "progresso_pct": 100, "linhas": 41892, "downloadUrl": "https://..." }
{ "status": "failed", "erro": "mensagem de erro" }

Depois de implementar, crie um teste manual simples (pode ser um pequeno script Node ou
instruções de como testar via curl/EventSource no navegador) que demonstra o fluxo completo:
criar um job → conectar no SSE → ver o progresso mudar → receber o evento de conclusão.

Nota sobre escala futura: se algum dia tivermos múltiplas instâncias do apps/web, esse polling
interno por instância pode ser substituído por um pub/sub real via Redis (BullMQ já usa Redis,
poderíamos publicar eventos de progresso lá). Não implemente isso agora, só deixe um comentário
no código apontando essa evolução futura.
```

## Após rodar este prompt
- Teste manualmente via navegador (DevTools > Network > EventStream) ou curl
- Avance para `14-cache-places-grid.md`
