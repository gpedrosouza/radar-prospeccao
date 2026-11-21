# Prompt 24 — Healthcheck e Rate Limiting

> Fase: 4 — Workers e Escala
> Pré-requisito: `23-backup-postgres-r2.md` concluído
> Último prompt da Fase 4

---

## Prompt

```
Leia o CLAUDE.md na raiz do projeto.

Para concluir a Fase 4, preciso de dois itens de robustez de produção:

### 1. Healthcheck

Crie (ou complete, se já existir um placeholder da Fase 0) a rota GET /api/health que:
- Verifica conectividade com o Postgres (uma query simples como SELECT 1)
- Verifica conectividade com o Redis (PING)
- Retorna 200 com {"status": "ok", "checks": {"database": "ok", "redis": "ok"}} se tudo OK
- Retorna 503 com detalhe de qual check falhou, se algo estiver indisponível
- Esta rota NÃO deve exigir autenticação (precisa ser acessível por serviços de monitoramento
  externos) — ajuste o middleware de auth da Fase 0 para excluir explicitamente esta rota

Documente em docs/deploy.md como configurar um monitor externo gratuito (ex: UptimeRobot)
apontando para https://[dominio]/api/health, com alerta por e-mail/webhook se ficar fora do ar.

### 2. Rate Limiting

As rotas mais sensíveis a abuso são as de criação de jobs (export e, futuramente, enriquecimento)
porque cada uma pode disparar processamento pesado ou custo de API externa. Implemente rate
limiting nessas rotas:

- POST /api/cnpj/export-jobs: limite de, por exemplo, 5 jobs simultâneos "running" ou "queued"
  por usuário (não deixe um usuário enfileirar 50 exportações de uma vez)
- Considere também um limite de taxa por janela de tempo (ex: máximo 10 jobs por hora por
  usuário) usando uma abordagem simples (pode ser uma contagem no Redis com TTL, não precisa
  de biblioteca pesada)

Implemente de forma que retorne um erro 429 claro ("Limite de exportações simultâneas atingido,
aguarde a conclusão de uma exportação em andamento") quando o limite for excedido, em vez de
simplesmente enfileirar e deixar o usuário esperando sem explicação.

Escreva um teste Vitest que confirma: ao tentar criar um 6º job simultâneo além do limite,
a API retorna 429.

Ao final desta etapa, atualize o CLAUDE.md da raiz, seção "Fase atual", para "Fase 5 — E-mail
(bloqueada até validação jurídica/LGPD ser concluída — ver vault)".
```

## Após rodar este prompt
- Isso conclui a Fase 4 inteira. Atualize [[03-Fases-Desenvolvimento/Status-Atual]]
- **Não inicie a Fase 5 sem a validação jurídica mencionada** — ver [[03-Fases-Desenvolvimento/Fase-5-Email]]
- Os prompts da Fase 5 (`25-schema-campanhas-email.md` em diante) estão prontos para quando o bloqueio for resolvido
