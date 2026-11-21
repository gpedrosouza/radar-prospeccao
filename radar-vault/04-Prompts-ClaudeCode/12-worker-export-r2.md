# Prompt 12 — Worker de Exportação com Upload para R2

> Fase: 2 — Core
> Pré-requisito: `11-bullmq-redis-setup.md` concluído
> Contexto de decisão: ver [[05-Decisoes-ADR/ADR-004-Storage-Externo-R2]]

---

## Prompt

```
Leia o CLAUDE.md na raiz do projeto.

Agora vamos implementar a lógica real do worker de exportação (o placeholder criado no prompt
anterior). O fluxo completo deve ser:

1. Worker recebe o job (filtros + exportJobId) da fila BullMQ
2. Atualiza CnpjExportJob para status "running"
3. Usa o cnpj.repository (de packages/db ou replicado em apps/workers — decida e documente
   a melhor forma de compartilhar essa lógica entre apps/web e apps/workers sem violar a regra
   de não-importação cruzada; provavelmente o repository deveria viver em packages/db desde
   já, reconsidere se necessário e ajuste o prompt anterior se fizer sentido)
4. Pagina a tabela CompanyCnpj por CURSOR (nunca OFFSET) aplicando os filtros
5. Para cada página, transforma os registros em linhas CSV (streaming, usando csv-stringify),
   comprime com gzip em streaming, e faz upload para Cloudflare R2 via multipart upload
   (usando @aws-sdk/client-s3, que é compatível com R2 — configure o endpoint do R2 via
   variáveis de ambiente R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET)
6. A cada N linhas processadas, atualiza progresso_pct na tabela CnpjExportJob
7. Ao finalizar, grava storage_key (a chave do arquivo no R2), linhas (contagem total),
   tamanho_bytes, e atualiza status para "completed" e concluido_em
8. Gera uma URL pré-assinada (válida por X horas, configurável) para download — decida onde
   essa URL deve ser gerada (no momento da conclusão, ou sob demanda quando o usuário pedir
   o download — considere os trade-offs e escolha, documentando por quê)
9. Em caso de erro em qualquer etapa, marca status "failed", grava o erro, e NÃO deixa arquivo
   parcial no R2 (limpe se necessário)

Importante: NUNCA carregue o resultado completo da query em memória de uma vez — tudo deve ser
streaming, da query do banco até o upload no R2.

Variáveis de ambiente novas a adicionar no .env.example:
R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, R2_PUBLIC_URL (se aplicável),
CNPJ_EXPORT_PRESIGNED_URL_EXPIRY_HOURS

Para testar sem credenciais reais do R2, configure o worker para funcionar com MinIO local
(adicione um serviço minio ao docker-compose.yml, compatível com S3, para testar o fluxo
completo de upload localmente antes de usar o R2 real em produção).

Teste o fluxo completo: crie um job com filtros que retornem poucos registros de teste,
confirme que o CSV é gerado corretamente, comprimido, e fica acessível via MinIO local.
```

## Após rodar este prompt
- Valide o arquivo `.csv.gz` gerado manualmente (descompacte e confira o conteúdo)
- Avance para `13-sse-progresso.md`
