# Prompt 03 — Schema Prisma com Particionamento por UF

> Fase: 0 — Fundação
> Pré-requisito: `02-docker-compose-postgres.md` concluído
> ⚠️ Este é o prompt mais importante da Fase 0 — errar aqui é caro de corrigir depois (ver ADR-002)

---

## Prompt

```
Preciso criar o schema inicial do banco em packages/db usando Prisma, mas com uma particularidade importante: a tabela principal (CompanyCnpj) vai receber cerca de 66 milhões de registros da Receita Federal, e PRECISA estar particionada por UF (estado) desde a criação. Particionar depois, com dados já carregados, é uma operação muito mais cara.

O Prisma não suporta particionamento nativamente no schema.prisma, então vamos usar uma abordagem híbrida:
1. Definir os modelos "normais" no schema.prisma para os campos e relações (isso gera o client TypeScript)
2. Usar uma migration SQL manual (raw) para criar a tabela já particionada, no lugar da migration automática do Prisma para essa tabela específica

Preciso dos seguintes modelos:

**User** (autenticação básica):
- id (uuid), nome, email (único), senha_hash, papel (enum: banker/admin), criado_em

**CompanyCnpj** (a tabela particionada — 66M de registros):
- id (bigint), cnpj (14 chars), razao_social, nome_fantasia, uf (2 chars), municipio_codigo (int),
  municipio_nome, cnae_principal (7 chars), situacao, porte, natureza_juridica, matriz_filial,
  opcao_simples (bool), opcao_mei (bool), data_abertura, capital_social (decimal), email, telefone,
  endereco, latitude/longitude (float, nullable até geocodificação), criado_em, atualizado_em

**City** (cidades/distritos para busca por raio):
- id, codigo_ibge, nome, uf, categoria (cidade/municipio/distrito), municipio_sede_id (self-relation), latitude, longitude

**CnpjExportJob** (espelho de auditoria dos jobs de exportação, a fila real vai ser BullMQ depois):
- id (uuid), usuario_id (fk User), filtros (json), status (queued/running/completed/failed),
  linhas (int nullable), tamanho_bytes (bigint nullable), storage_key (text nullable),
  progresso_pct (smallint default 0), erro (text nullable), criado_em, concluido_em (nullable)

Depois de definir o schema.prisma com esses modelos (sem a tabela CompanyCnpj sendo gerenciada
diretamente pelo Prisma na migration automática — explique como você vai lidar com isso, seja via
migration SQL manual dentro da pasta de migrations do Prisma, seja documentando o processo),
crie a migration SQL manual que:

1. Cria a tabela CompanyCnpj particionada por LIST (uf), com PRIMARY KEY (id, uf)
2. Cria as 27 partições, uma para cada UF do Brasil (AC, AL, AP, AM, BA, CE, DF, ES, GO, MA, MT,
   MS, MG, PA, PB, PR, PE, PI, RJ, RN, RS, RO, RR, SC, SP, SE, TO)
3. Cria os índices:
   - Índice parcial em (municipio_codigo, cnae_principal) WHERE situacao = 'Ativa'
   - Índice em cnae_principal usando text_pattern_ops (para busca por prefixo)
   - Índice composto em (uf, id) para paginação por cursor
4. Adiciona a extensão PostGIS e uma coluna geom (GEOGRAPHY Point) na tabela, com índice GIST
   (pode ficar sem dados por agora, populada só na fase de geocodificação)

Aplique a migration no banco local (via docker compose) e valide com uma query que:
- Insira 3 registros de teste em UFs diferentes (SP, RJ, BA)
- Confirme que cada registro foi para a partição correta (consultando pg_partition ou similar)
- Rode EXPLAIN numa query filtrando por UF='SP' e confirme que o plano usa partition pruning

Me explique ao final como esse processo de "schema Prisma + migration manual para a tabela
particionada" deve funcionar daqui pra frente quando eu precisar adicionar uma coluna nessa tabela.
```

## Após rodar este prompt
- Valide manualmente o `EXPLAIN` mencionado — isso é o teste mais importante
- Documente em `05-Decisoes-ADR/` se o Claude Code sugerir uma abordagem diferente da do ADR-002 e você aceitar
- Avance para `04-auth-basica.md`
