# Prompt 04 — Autenticação Básica

> Fase: 0 — Fundação
> Pré-requisito: `03-schema-prisma-particionado.md` concluído

---

## Prompt

```
Preciso de autenticação básica em apps/web usando NextAuth.js (Auth.js), com as seguintes
características:

1. Provider de Credentials (e-mail + senha) — sem OAuth/social login por agora
2. Senha armazenada com hash usando bcrypt ou argon2 (prefira argon2 se a integração não for
   muito mais complexa)
3. Sessão via JWT (não precisamos de banco de sessões separado por agora)
4. Middleware que protege TODAS as rotas sob /api/* (exceto /api/auth/*) — qualquer requisição
   sem sessão válida deve retornar 401 com um JSON {"error": "unauthorized"}
5. Uma página de login simples em /login (pode ser bem básica visualmente por agora, vamos
   refinar o design depois) usando o modelo User que já existe no schema Prisma (packages/db)
6. Um script de seed (em packages/db/seeds ou similar) que cria um usuário admin de teste,
   lendo e-mail/senha de variáveis de ambiente (não hardcoded no código)

Depois de implementar:
- Rode o seed e crie o usuário de teste
- Teste manualmente (ou com um teste automatizado Vitest) que:
  a) Login com credenciais corretas retorna sessão válida
  b) Login com credenciais erradas é rejeitado
  c) Uma chamada a uma rota de API de teste (crie uma rota /api/health que só retorna {"ok": true})
     funciona COM sessão e falha com 401 SEM sessão

Me avise se você precisar adicionar alguma variável nova ao .env.example, e mantenha o arquivo
atualizado com comentários explicando cada variável nova relacionada a auth (ex: NEXTAUTH_SECRET).
```

## Após rodar este prompt
- Teste manualmente o fluxo de login/logout
- Avance para `05-claude-md-raiz.md`
