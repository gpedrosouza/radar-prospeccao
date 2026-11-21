---
tags: [visao, produto, ux]
---

# Personas e Jornada

## Persona 1 — Banker (usuário primário)

**Perfil:** Personal banker, atende uma carteira regional, não é técnico, usa o sistema em momentos curtos entre visitas/ligações. Frequentemente em mobile ou notebook fraco em campo.

**Necessidade central:** "Quero saber quais empresas existem nesta região que valem minha visita ou contato, sem precisar pedir isso pra ninguém."

**Jornada principal:**
1. Abre o sistema → define origem (cidade onde está ou vai estar)
2. Define raio (ex: 40km)
3. Aplica filtros relevantes (situação ativa, porte, CNAE do segmento que está trabalhando)
4. Vê resultado no mapa + tabela
5. Decide: exporta lista para trabalhar manualmente, OU dispara campanha de e-mail direto

**Frustração que o sistema deve evitar:** esperar muito tempo, números incertos ("quantos resultados eu realmente tenho?"), perder o que já filtrou ao trocar de tela.

## Persona 2 — Gestor Regional (usuário secundário)

**Perfil:** Acompanha múltiplos bankers, quer entender efetividade das campanhas e cobertura territorial.

**Necessidade central:** "Quais regiões já foram trabalhadas? Quais campanhas tiveram resposta?"

**Jornada principal:**
1. Acessa aba de Analytics/Campanhas
2. Vê histórico agregado (não precisa filtrar CNPJ a CNPJ)
3. Eventualmente exporta relatório

> No MVP, esta persona pode ser atendida via Metabase/BI direto, sem tela dedicada no produto.

## Jornada crítica de ponta a ponta (a que define o MVP)

```
Banker abre o app
  → define origem + raio
  → aplica filtro (situação=Ativa, CNAE=X)
  → vê contagem e amostra na tela
  → [opcional] exporta CSV completo (job assíncrono)
  → [opcional] usa a base exportada para campanha de e-mail
  → [opcional] recebe resposta no e-mail pessoal dele (não no sistema)
```

Tudo que não está nessa linha é V2 ou mais tarde. Ver [[00-Visao/Escopo-MVP]].

## Restrição de uso real

O sistema é **interno e de uso individual por banker** — não há necessidade de painel multi-tenant complexo no MVP, mas autenticação básica (quem fez o quê) é obrigatória desde o dia 1, porque dados de prospecção e disparo de e-mail em nome do banco exigem rastreabilidade.
