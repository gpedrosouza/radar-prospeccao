# Prompt 23 — Backup Automático do Postgres para R2

> Fase: 4 — Workers e Escala
> Pré-requisito: `22-ci-cd-deploy-ssh.md` concluído
> ⚠️ Backup sem teste de restauração não é backup — o critério de saída desta fase exige
> restaurar de verdade, não só configurar o cron.

---

## Prompt

```
Leia o CLAUDE.md na raiz do projeto.

Preciso de backup automático do Postgres de produção, enviado para um bucket R2 separado dos
arquivos de exportação de usuário (use um bucket ou prefixo diferente, ex: "backups/" vs
"exports/", para não misturar com os dados que os bankers exportam).

Crie:

1. Um script (apps/workers/src/scripts/backup-postgres.ts ou um shell script simples, decida
   o que é mais apropriado) que:
   - Roda pg_dump com formato customizado (-Fc, permite restauração seletiva e é mais
     compacto que SQL puro)
   - Comprime o resultado (pg_dump -Fc já comprime razoavelmente, avalie se gzip adicional
     compensa)
   - Faz upload para o R2 com nome incluindo timestamp (ex: backup-2026-06-19-0300.dump)
   - Remove backups locais temporários após upload confirmado
   - Mantém uma política de retenção simples: backups diários dos últimos 7 dias, backups
     semanais dos últimos 30 dias (implemente a lógica de quais manter/descartar no R2)

2. Configuração de cron (dentro de um container dedicado no docker-compose.prod.yml, usando
   uma imagem simples como uma cron job containerizada, ou via cron do host VPS — escolha a
   abordagem mais simples e confiável e documente por quê) rodando esse script diariamente
   num horário de baixo uso (ex: 3h da manhã)

3. Um segundo script (restore-postgres.ts) que:
   - Aceita o nome/timestamp do backup a restaurar
   - Baixa do R2
   - Restaura via pg_restore num banco de destino (que deve ser parametrizável via
     DATABASE_URL, para eu poder testar restaurando num banco de teste local, não em produção)

Depois de implementar, faça o seguinte teste obrigatório:
a) Gere um backup real do banco de desenvolvimento atual (com os dados de teste que já temos)
b) Suba um Postgres novo e vazio (outro container ou outra porta)
c) Restaure o backup nesse banco vazio usando o script de restore
d) Confirme que os dados restaurados batem com o banco original (conte registros nas tabelas
   principais e compare)

Não considere esta etapa concluída até o teste de restauração (passo c e d) funcionar de
verdade — esse é o critério de saída desta fase conforme documentado no vault.
```

## Após rodar este prompt
- **Não pule o teste de restauração.** Isso é o item mais frequentemente negligenciado em projetos reais
- Avance para `24-healthcheck-rate-limit.md`
