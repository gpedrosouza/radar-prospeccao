---
tags: [fase, workers, escala, devops]
status: nao-iniciada
---

# Fase 4 — Workers e Escala (Produção)

**Objetivo:** sair de "funciona no meu computador" para "está em produção de forma confiável" — deploy real, monitoramento, backups testados.

## Entregáveis

1. VPS provisionada (ver [[01-Arquitetura/Infraestrutura-e-Deploy]])
2. `docker-compose.prod.yml` com Caddy/Traefik para HTTPS automático
3. CI/CD: merge em `main` builda imagens e faz deploy via SSH
4. Backup automático do Postgres (cron + envio para R2), com restauração testada manualmente pelo menos uma vez
5. Healthcheck (`/api/health`) monitorado externamente (UptimeRobot ou similar, tier gratuito)
6. Rate limiting básico nas rotas de exportação/enriquecimento

## Critério de saída

- [ ] Aplicação acessível via domínio próprio com HTTPS válido
- [ ] Deploy automático funciona ao fazer merge em `main`
- [ ] Backup rodou com sucesso e foi restaurado em ambiente de teste com sucesso
- [ ] Alerta de healthcheck chega (testar derrubando o container propositalmente)

## Prompts relacionados (em ordem)
1. `04-Prompts-ClaudeCode/21-docker-compose-prod-caddy.md`
2. `04-Prompts-ClaudeCode/22-ci-cd-deploy-ssh.md`
3. `04-Prompts-ClaudeCode/23-backup-postgres-r2.md`
4. `04-Prompts-ClaudeCode/24-healthcheck-rate-limit.md`

## Links relacionados
- [[01-Arquitetura/Infraestrutura-e-Deploy]]
- [[02-Custos/Custo-Mensal-Consolidado]]
