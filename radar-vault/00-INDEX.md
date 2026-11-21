---
tags: [hub, radar-prospeccao]
---

# 🎯 Radar de Prospecção Geográfica — Hub do Projeto

> Vault de gestão de contexto do projeto. Esta é a página inicial — comece toda sessão de trabalho aqui.

## 🧭 Como usar este vault

1. Antes de abrir o Claude Code, releia [[00-Visao/Visao-Geral|Visão Geral]] e a fase atual em [[03-Fases-Desenvolvimento/Status-Atual|Status Atual]].
2. Abra o prompt da etapa em `04-Prompts-ClaudeCode/`, copie para o Claude Code.
3. Ao terminar uma sessão, registre o que foi feito em `Daily/` (use o template).
4. Se uma decisão importante foi tomada (trade-off, mudança de rumo), registre em `05-Decisoes-ADR/`.
5. Nunca deixe o Claude Code "adivinhar" contexto — sempre referencie o arquivo relevante deste vault no prompt.

## 📂 Mapa do Vault

### Visão e Produto
- [[00-Visao/Visao-Geral]] — o que é o produto, pra quem, por quê
- [[00-Visao/Personas-e-Jornada]] — quem usa e como usa
- [[00-Visao/Escopo-MVP]] — o que entra e o que NÃO entra no MVP

### Arquitetura
- [[01-Arquitetura/Arquitetura-Geral]] — visão macro do sistema
- [[01-Arquitetura/Modelo-de-Dados]] — schema do banco, particionamento
- [[01-Arquitetura/Stack-Tecnica]] — todas as tecnologias e por quê
- [[01-Arquitetura/Seguranca-e-Auth]] — autenticação, autorização, LGPD
- [[01-Arquitetura/Infraestrutura-e-Deploy]] — servidores, Docker, CI/CD


### Fases de Desenvolvimento
- [[03-Fases-Desenvolvimento/Status-Atual]] ⭐ — **olhe aqui primeiro, sempre**
- [[03-Fases-Desenvolvimento/Fase-0-Fundacao]]
- [[03-Fases-Desenvolvimento/Fase-1-Dados]]
- [[03-Fases-Desenvolvimento/Fase-2-Core]]
- [[03-Fases-Desenvolvimento/Fase-3-UI]]
- [[03-Fases-Desenvolvimento/Fase-4-Workers]]
- [[03-Fases-Desenvolvimento/Fase-5-Email]]

### Prompts para Claude Code
- `04-Prompts-ClaudeCode/` — prompts prontos, organizados por fase, em ordem de execução

### Prompts para Claude Design
- `07-Prompts-ClaudeDesign/` — briefs de design (Fable 5) para telas públicas novas. O resultado
  vira referência em `docs/design/<nome>-origem/` e alimenta o prompt de código correspondente
  em `04-Prompts-ClaudeCode/` — nunca pule direto pro código sem o design pronto.

### Decisões Arquiteturais (ADR)
- [[05-Decisoes-ADR/ADR-Template]] — modelo para novas decisões
- [[05-Decisoes-ADR/ADR-005-Identidade-Visual-GR]] — identidade visual GR aplicada à UI ⭐ recente
- Pasta `05-Decisoes-ADR/` acumula um arquivo por decisão importante

### Glossário
- [[06-Glossario/Termos-do-Dominio]] — CNAE, Simples/MEI, matriz/filial, BullMQ, PostGIS, SSE, etc.

## 🚦 Status Rápido

```dataview
TABLE status, ultima-atualizacao
FROM "03-Fases-Desenvolvimento"
WHERE contains(file.name, "Fase")
```

> Se o plugin Dataview não estiver instalado, veja manualmente em [[03-Fases-Desenvolvimento/Status-Atual]].

## 🔑 Regra de Ouro

**Toda sessão nova de Claude Code deve começar carregando o `CLAUDE.md` do repositório + o arquivo de fase relevante deste vault.** Isso evita que o agente perca contexto entre sessões e repita decisões já tomadas.
