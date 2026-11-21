---
tags: [arquitetura, seguranca, lgpd]
---

# Segurança, Autenticação e LGPD

## Autenticação (desde o dia 1, não é "depois")

- NextAuth.js com provider de credentials (e-mail + senha, hash com bcrypt/argon2)
- Toda rota sob `/api/*` (exceto login) exige sessão válida via middleware
- Toda ação de escrita (criar export job, disparar campanha) grava `usuario_id`

```ts
// middleware.ts — esqueleto conceitual
export function middleware(req: NextRequest) {
  const session = getSessionFromCookie(req);
  if (!session && req.nextUrl.pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
}
```

## Autorização (papéis)

MVP precisa só de dois papéis:
- `banker` — usa o sistema normalmente
- `admin` — também acessa configurações e (futuramente) aprova campanhas de e-mail antes do disparo

## Segredos e variáveis de ambiente

- `.env.local` nunca commitado (já era assim na v1 — manter)
- Em produção: variáveis injetadas via Docker Compose secrets ou painel do provedor, nunca em arquivo dentro do container
- Chaves do Google Maps: duas chaves distintas (frontend restrita por HTTP referrer, backend restrita por IP) — prática já correta na v1, manter

## LGPD — pontos de atenção concretos (não é só "ter cuidado")

### Base de CNPJs (Receita Federal)
Dados de pessoa jurídica (CNPJ, razão social) têm tratamento diferente de dados de pessoa física. Mas atenção: a base de sócios (QSA) contém CPF e nome de pessoa física — isso já é dado pessoal e exige cuidado de acesso/retenção mesmo sendo de fonte pública.

### E-mail de prospecção (quando a Fase 5 chegar)
- O e-mail do estabelecimento na Receita foi fornecido para fins cadastrais — usá-lo para prospecção comercial é uma área que demanda análise jurídica formal antes do primeiro disparo em produção. **Isso não é uma decisão técnica, é uma decisão do banco/jurídico.**
- Toda campanha precisa de link de descadastro funcional (exigência também do Gmail/Yahoo para deliverability, ver [[02-Custos/Email-Dominio-Deliverability]])
- Endereços que pediram descadastro ou que geraram bounce permanente nunca devem ser recontactados — tabela `EmailUnsubscribe` e `EmailBounce` são checadas antes de qualquer envio

### Auditoria mínima
Toda exportação e todo disparo de campanha fica registrado com usuário, timestamp e filtros usados — não é só para debug, é rastreabilidade exigível.

## Checklist de segurança antes de qualquer deploy em produção

- [ ] `.env.local` e secrets fora do controle de versão
- [ ] HTTPS obrigatório (Let's Encrypt via Caddy/Traefik no Docker Compose)
- [ ] Rate limiting básico nas rotas de API (especialmente export e enriquecimento)
- [ ] Backup automático do Postgres configurado e testado (restaurar de verdade, não só configurar)
- [ ] Logs não vazam dados sensíveis (CPF de sócios, senhas) em texto plano

## Links relacionados
- [[01-Arquitetura/Arquitetura-Geral]]
- [[03-Fases-Desenvolvimento/Fase-5-Email]]
- [[02-Custos/Email-Dominio-Deliverability]]
