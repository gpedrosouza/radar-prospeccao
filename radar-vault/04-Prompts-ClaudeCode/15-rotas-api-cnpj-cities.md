# Prompt 15 — Rotas de API (CNPJ, Cidades, Export Jobs)

> Fase: 2 — Core
> Pré-requisito: `14-cache-places-grid.md` concluído
> Este é o último prompt da Fase 2 — conclui o backend antes de começar a UI

---

## Prompt

```
Leia o CLAUDE.md na raiz do projeto.

Agora vamos criar as rotas de API que o frontend (Fase 3) vai consumir. Todas seguem a regra:
rota -> service -> repository, nunca pulando camada.

Crie as seguintes rotas em apps/web/src/app/api:

1. GET /api/cities/radius?lat=X&lng=Y&raioKm=Z
   - Usa radius-search.service (já existe da Fase 2, prompt 10)
   - Retorna lista de cidades/distritos no raio

2. GET /api/places/companies?lat=X&lng=Y&raioKm=Z&keyword=W
   - Usa places-search.service (já existe, prompt 14, com cache)

3. GET /api/cnpj/companies (com query params para todos os filtros: uf, cidades, situacao,
   cnae, porte, matrizFilial, simples, mei, dataAberturaDe, dataAberturaAte, cursor, limit)
   - Usa cnpj-search.service
   - IMPORTANTE: limitar o `limit` máximo aceito (ex: 2000), mesmo que o usuário peça mais —
     isso é amostra para tela, não exportação completa
   - Retorna também a contagem total estimada (cuidado: COUNT(*) exato sobre milhões de linhas
     é caro — considere usar uma estimativa via EXPLAIN ou um count aproximado, e documente
     a decisão)

4. POST /api/cnpj/export-jobs (body com os mesmos filtros de cima)
   - Usa export.service para criar o job e enfileirar no BullMQ
   - Retorna o ID do job imediatamente

5. GET /api/cnpj/export-jobs (lista os jobs do usuário autenticado, para a tela de histórico)

6. GET /api/cnpj/export-jobs/[id] (detalhe de um job específico)

(a rota de stream SSE já foi feita no prompt 13)

Todas as rotas (exceto talvez /api/health) devem:
- Validar query params/body com Zod (schemas de packages/shared)
- Exigir sessão válida (o middleware da Fase 0 já cobre isso, mas confirme)
- Associar o usuário autenticado como usuarioId nas operações de escrita (export jobs)
- Retornar erros de validação como 400 com detalhes claros, não como 500

Escreva testes de integração (Vitest) para pelo menos a rota de criação de export job e a de
busca de CNPJs, usando um banco de teste (pode ser o mesmo Postgres local com uma transação
revertida ao final de cada teste, ou um schema separado de teste — escolha e documente a
abordagem).

Ao final, atualize o CLAUDE.md da raiz na seção "Fase atual" para "Fase 3 — UI (próxima)".
```

## Após rodar este prompt
- Isso conclui a Fase 2 inteira. Atualize [[03-Fases-Desenvolvimento/Status-Atual]]
- Faça um teste manual ponta a ponta via curl/Postman de todo o fluxo antes de avançar
- Avance para os prompts da Fase 3 (`16-layout-shell-sidebar.md` em diante)
