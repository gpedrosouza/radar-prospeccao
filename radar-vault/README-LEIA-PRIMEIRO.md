# Como usar este vault

Este é um vault do Obsidian com o plano de desenvolvimento completo do **Radar de Prospecção
Geográfica v2**. Ele cobre visão de produto, arquitetura, custos, fases de desenvolvimento,
28 prompts prontos para Claude Code, e ADRs (decisões arquiteturais documentadas).

## Como importar no Obsidian

1. Baixe e extraia o arquivo `radar-vault.zip`
2. Abra o Obsidian → "Open folder as vault" → selecione a pasta extraída `radar-vault/`
3. Comece pela página `00-INDEX.md` — ela é o hub de navegação de tudo

## Plugins recomendados (opcionais)

- **Dataview**: usado na página inicial para listar status das fases automaticamente. Sem ele,
  o vault funciona normalmente, só perde essa tabela automática.
- **Templater**: se quiser automatizar a criação dos logs diários a partir do template em
  `Templates/Template-Log-Sessao.md`

## Fluxo de trabalho recomendado

```
1. Abra 00-INDEX.md
2. Vá em 03-Fases-Desenvolvimento/Status-Atual.md → veja em que ponto você está
3. Abra o prompt correspondente em 04-Prompts-ClaudeCode/ (em ordem numérica)
4. Copie o conteúdo da seção "Prompt" para o Claude Code
5. Trabalhe a sessão
6. Ao final, copie o template de Templates/Template-Log-Sessao.md para Daily/AAAA-MM-DD.md
   e preencha
7. Atualize Status-Atual.md com o resumo
8. Se alguma decisão importante foi tomada, crie um novo ADR em 05-Decisoes-ADR/
   usando ADR-Template.md
```

## Ordem dos 28 prompts (visão geral)

| # | Prompt | Fase |
|---|---|---|
| 01-05 | Setup monorepo → Docker → Schema particionado → Auth → CLAUDE.md | Fase 0 — Fundação |
| 06-09 | Importador Receita → Índices → Schema analytics → Geocodificação | Fase 1 — Dados |
| 10-15 | Services/Repos → BullMQ → Worker+R2 → SSE → Cache Places → Rotas API | Fase 2 — Core |
| 16-20 | Layout → Mapa → Tabela CNPJs → Exportações → Filtros unificados | Fase 3 — UI |
| 21-24 | Docker prod → CI/CD → Backup → Healthcheck/Rate limit | Fase 4 — Workers/Escala |
| 25-28 | Schema email → Resend → Webhooks → Tela campanha | Fase 5 — E-mail (bloqueada por validação jurídica) |

## Regra mais importante

**Toda sessão de Claude Code deve começar com o `CLAUDE.md` da raiz do repositório de código**
(criado no Prompt 05) sendo lido — isso é automático se você estiver rodando o Claude Code
dentro da pasta do projeto. O vault Obsidian é a camada de contexto **mais profunda e
deliberada** — use-o para reidratar sua própria memória antes de escrever os prompts, e para
registrar decisões que o `CLAUDE.md` (que deve ficar curto) não tem espaço para detalhar.
