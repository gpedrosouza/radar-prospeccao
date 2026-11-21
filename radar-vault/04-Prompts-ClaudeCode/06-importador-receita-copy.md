# Prompt 06 — Importador da Receita Federal com COPY Nativo

> Fase: 1 — Dados
> Pré-requisito: Fase 0 completa (schema particionado existindo)

---

## Prompt

```
Antes de começar, leia o CLAUDE.md na raiz do projeto para relembrar as regras arquiteturais.

Preciso construir o importador da base de Dados Abertos CNPJ da Receita Federal, em
apps/workers (nunca em apps/web). Este importador vai processar arquivos ZIP que contêm CSVs
de até dezenas de milhões de linhas, então a abordagem de INSERT em lote é inviável — preciso
usar o comando COPY nativo do Postgres via streaming.

Contexto dos arquivos (todos vêm de https://arquivos.receitafederal.gov.br/dados/cnpj/dados_abertos_cnpj/):
- Empresas0.zip a Empresas9.zip: razão social, natureza jurídica, porte, capital social
- Estabelecimentos0.zip a Estabelecimentos9.zip: CNPJ completo, nome fantasia, situação, CNAE,
  endereço, contatos — este é o maior conjunto de arquivos
- Simples.zip: optantes do Simples Nacional/MEI
- Cnaes.zip, Naturezas.zip, Municipios.zip, Paises.zip, Qualificacoes.zip: dicionários
- Socios0.zip a Socios9.zip: quadro de sócios

Os arquivos dentro dos ZIPs são CSVs com encoding Latin-1, separador ";", sem cabeçalho.

**Filtragem obrigatória durante a importação** (aplicar na etapa de Estabelecimentos, antes do
COPY — nunca pós-carga, pois isso desperdiçaria espaço e tempo de UPDATE em ~66M registros):
- Manter apenas estabelecimentos com situação cadastral **ATIVA** (campo índice 5 = `"02"`)
- Excluir todos os CNPJs identificados como **MEI** no arquivo Simples.zip (campo índice 4 = `"S"`)

Estratégia para o filtro de MEI: ao importar Simples.zip (fase anterior a Estabelecimentos),
carregar em memória um `Set<string>` com os `cnpj_basico` (8 dígitos) marcados como MEI.
Durante o streaming de Estabelecimentos, rejeitar a linha se `meiSet.has(cols[0])`. Documentar
no script que esse Set pode ocupar ~1 GB de RAM para os ~15 M de MEIs existentes.

Preciso de um script (apps/workers/src/scripts/import-receita.ts ou similar) que:

1. Use a biblioteca yauzl para ler os ZIPs sem extrair tudo em disco de uma vez
2. Para cada arquivo CSV dentro do ZIP, faça streaming linha por linha, transforme cada linha
   no formato da tabela CompanyCnpj (ou tabela de dicionário correspondente), e use COPY via
   a biblioteca pg-copy-streams para inserir em lote no Postgres — NÃO usar INSERT linha a linha
   nem Prisma.create em loop, isso seria ordens de magnitude mais lento
3. Suporte às variáveis de ambiente:
   - RECEITA_CNPJ_DIR (pasta onde estão os ZIPs)
   - RECEITA_IMPORT_MAX_ROWS (para testar com amostra pequena antes da carga real)
   - RECEITA_IMPORT_ONLY (dictionaries | empresas | simples | socios | estabelecimentos)
   - RECEITA_IMPORT_BATCH_SIZE
   - RECEITA_IMPORT_PROGRESS_EVERY (a cada quantas linhas imprimir progresso)
4. Como a tabela CompanyCnpj é particionada por UF, e o COPY precisa saber em qual partição
   inserir — explique como você vai lidar com isso (provavelmente o COPY pode ir direto na
   tabela-mãe particionada e o Postgres redireciona automaticamente, mas confirme isso e ajuste
   se necessário)
5. Trate encoding Latin-1 -> UTF-8 corretamente durante o stream
6. Ignore linhas malformadas sem quebrar o processo inteiro, mas logue quantas foram ignoradas
7. No log de progresso de Estabelecimentos, exibir contadores separados para:
   linhas processadas / inseridas / ignoradas por inatividade / ignoradas por MEI / malformadas

Antes de rodar a carga real, vamos testar com RECEITA_IMPORT_MAX_ROWS=1000 e
RECEITA_IMPORT_ONLY=dictionaries, depois empresas, depois simples, depois socios, depois
estabelecimentos, nessa ordem (a ordem importa porque estabelecimentos referencia dados de
empresas e simples).

Não tenho os arquivos reais da Receita disponíveis agora neste ambiente — implemente o script
de forma completa e testável, e me explique exatamente como rodar quando eu tiver os arquivos
baixados localmente. Se for útil, crie também um pequeno CSV de exemplo/mock para testar a
lógica de parsing sem precisar dos arquivos reais da Receita.
```

## Após rodar este prompt
- Valide a lógica de parsing com os dados mock antes de baixar os arquivos reais da Receita
- Confirme nos logs que os contadores de inatividade e MEI fazem sentido (espera-se descartar a
  grande maioria dos ~66M registros brutos, ficando com ~10–15M estabelecimentos ativos não-MEI)
- Quando for rodar a carga real, siga a ordem: dictionaries → empresas → simples → socios → estabelecimentos
- Avance para `07-indices-e-analyze.md`
