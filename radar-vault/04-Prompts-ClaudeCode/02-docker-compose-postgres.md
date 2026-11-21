# Prompt 02 — Docker Compose com Postgres+PostGIS e Redis

> Fase: 0 — Fundação
> Pré-requisito: `01-setup-monorepo.md` concluído

---

## Prompt

```
Agora preciso do docker-compose.yml para desenvolvimento local. O sistema vai lidar com uma tabela de ~66 milhões de registros (CNPJs da Receita Federal), então o Postgres precisa estar configurado para isso desde já, não como ajuste posterior.

Crie um docker-compose.yml na raiz do projeto com estes serviços:

1. **postgres**: imagem postgis/postgis:16-3.4
   - Volume nomeado para persistência
   - Variáveis de ambiente via .env (não hardcoded)
   - Configuração de performance via comando ou arquivo postgresql.conf montado:
     shared_buffers=2GB, effective_cache_size=6GB, work_mem=64MB,
     maintenance_work_mem=512MB, max_parallel_workers_per_gather=4, max_parallel_workers=4
   - Porta 5432 exposta para desenvolvimento local

2. **redis**: imagem redis:7-alpine
   - Volume nomeado para persistência
   - Porta 6379 exposta

3. **web**: build a partir de apps/web (Dockerfile que ainda vamos criar — por agora pode ser um placeholder comentado, já que o app ainda não tem features)

Crie também:
- Um arquivo .env.example na raiz com todas as variáveis necessárias (DATABASE_URL, REDIS_URL, etc.), documentadas com comentários explicando cada uma
- Um script ou seção no README explicando como subir o ambiente local (docker compose up -d) e como verificar que o Postgres está com as configurações de performance aplicadas (query para conferir shared_buffers, por exemplo)

Depois de criar tudo, suba o ambiente com docker compose up -d e valide que:
- O Postgres está acessível na porta 5432
- A extensão PostGIS está disponível (rode CREATE EXTENSION IF NOT EXISTS postgis; e confirme)
- O Redis responde a um PING

Me avise se algo falhar e o que você ajustou para resolver.
```

## Após rodar este prompt
- Confirme `docker compose ps` mostra os serviços saudáveis
- Avance para `03-schema-prisma-particionado.md`
