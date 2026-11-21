# Prompt 14 — Cache de Places por Grid Territorial

> Fase: 2 — Core
> Pré-requisito: `13-sse-progresso.md` concluído
> Contexto de custo: ver [[02-Custos/Custo-Mensal-Consolidado]] — este é o item de maior
> impacto financeiro de todo o sistema. Cache bem feito aqui é a alavanca de custo mais
> importante do projeto inteiro.

---

## Prompt

```
Leia o CLAUDE.md na raiz do projeto.

O Google Places API (especialmente Nearby Search/Text Search) é, de longe, o item mais caro
do sistema (~$32 por 1.000 requisições no tier de entrada). Cada busca de raio sem cache
dispara uma chamada cara. Como empresas não aparecem/desaparecem do Google Maps todo dia,
podemos cachear agressivamente por REGIÃO GEOGRÁFICA, não por busca exata.

Preciso implementar um cache baseado em grid territorial:

1. Defina uma função que, dado um par lat/lng e um raio, calcula qual(is) célula(s) de um grid
   geográfico (por exemplo, dividindo o território em hexágonos ou quadrados de ~5-10km de
   lado — escolha uma abordagem simples como arredondar lat/lng para uma grade fixa, não
   precisa ser H3 ou algo sofisticado para o MVP) a busca cobre

2. Crie uma tabela PlacesCache (adicione ao schema Prisma):
   - id, grid_cell_key (string, identifica a célula), keyword (a palavra-chave buscada,
     pode ser vazia para "todas"), resultado (jsonb, a resposta crua da API), criado_em,
     expira_em

3. No service que busca Places (crie places-search.service.ts em apps/web/src/server/services),
   implemente a lógica:
   a) Antes de chamar a API do Google, calcule a(s) célula(s) de grid cobertas pela busca atual
   b) Consulte PlacesCache por essas células + keyword, filtrando por não-expirado
   c) Se há cache válido cobrindo a área, retorne os resultados cacheados (combinando múltiplas
      células se a busca cobrir mais de uma)
   d) Se não há cache (ou está parcialmente desatualizado), chame a API do Google SÓ para as
      células faltantes, salve o resultado no cache com TTL configurável
      (PLACES_CACHE_TTL_DAYS, sugestão de default: 30 dias)

4. Crie a rota de API /api/places/companies que usa esse service

5. Crie também o script de limpeza (apps/workers/src/scripts/cleanup-places-cache.ts) que
   remove entradas expiradas — pode ser chamado via cron simples (não precisa de fila BullMQ
   para isso, é uma limpeza simples)

Escreva um teste Vitest que simula: primeira busca numa região (deve chamar a API mockada),
segunda busca na mesma região (NÃO deve chamar a API, deve vir do cache).

Ao final, me explique a economia esperada: se 80% das buscas de uma região já tiverem cache
válido, qual a redução percentual estimada no custo de Places API?
```

## Após rodar este prompt
- Isso conclui a Fase 2 (junto com a próxima fase de rotas). Avance para `15-rotas-api-cnpj-cities.md`
