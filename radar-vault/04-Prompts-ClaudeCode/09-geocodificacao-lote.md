# Prompt 09 — Geocodificação em Lote (Sob Demanda)

> Fase: 1 — Dados
> Pré-requisito: `08-schema-analytics.md` concluído

---

## Prompt

```
Leia o CLAUDE.md na raiz do projeto.

A base da Receita não vem com latitude/longitude por estabelecimento. Geocodificar via API do
Google tem custo por chamada, então isso NUNCA deve rodar automaticamente sobre toda a base —
só sob demanda, com limite explícito, controlado por quem está rodando o comando.

Preciso de um script em apps/workers (apps/workers/src/scripts/geocode-cnpj.ts) que:

1. Aceita um parâmetro de limite (ex: npm run geocode:cnpj -- 100, geocodifica só 100 registros)
2. Seleciona registros de CompanyCnpj que: têm endereço preenchido E latitude/longitude NULL
   E (idealmente) situação = 'Ativa', priorizando os mais relevantes primeiro (você decide um
   critério razoável, ex: mais recentes ou por UF específica via variável de ambiente)
3. Para cada registro, chama a Geocoding API do Google (usando GOOGLE_MAPS_API_KEY do ambiente)
   com delay configurável entre chamadas (CNPJ_GEOCODE_DELAY_MS, default 150ms) para não
   exceder rate limits
4. Atualiza latitude, longitude E a coluna geom (PostGIS, GEOGRAPHY Point) com o resultado
5. Trata erros de geocodificação sem quebrar o loop inteiro (log e continua)
6. Imprime progresso a cada N registros processados

Variáveis de ambiente a suportar:
- CNPJ_GEOCODE_LIMIT (limite default se não passado via linha de comando)
- CNPJ_GEOCODE_DELAY_MS
- CNPJ_GEOCODE_UF (opcional, restringe a uma UF específica)

Não tenho uma API key real configurada neste ambiente de teste — implemente o script completo
e me explique como simular/testar a lógica sem gastar chamadas reais (por exemplo, com um modo
--dry-run que loga o que seria feito sem chamar a API de fato).

Depois, me explique brevemente por que este script é "sob demanda" e nunca deve ser chamado
automaticamente em produção sem um limite explícito.
```

## Após rodar este prompt
- Isso conclui a Fase 1. Atualize [[03-Fases-Desenvolvimento/Status-Atual]]
- Avance para os prompts da Fase 2 (`10-camada-services-repositories.md` em diante)
