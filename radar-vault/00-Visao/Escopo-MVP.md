---
tags: [visao, produto, escopo]
---

# Escopo do MVP

> Regra: se não está na lista de "Entra", não existe ainda. Resista à tentação de adiantar fases — é exatamente isso que gerou o "Frankenstein" da v1.

## ✅ Entra no MVP

### Mapa e busca
- [ ] Mapa com origem por busca de cidade/endereço/empresa
- [ ] Raio ajustável (slider)
- [ ] Visualização de pins de CNPJs geocodificados (situação por cor)
- [ ] Cache de resultados Places por região (grid territorial, TTL longo)

### CNPJs
- [ ] Filtros: UF, cidade/raio, situação, CNAE (prefixo), porte, matriz/filial, Simples/MEI, data de abertura
- [ ] Tabela paginada (amostra limitada, ex: 500)
- [ ] Filtros refletidos na URL (compartilháveis)
- [ ] Chips de filtro ativo removíveis

### Exportação
- [ ] Exportação assíncrona via fila (BullMQ)
- [ ] Progresso em tempo real (SSE)
- [ ] Download via URL pré-assinada (storage externo — R2)
- [ ] Histórico de exportações por usuário

### Autenticação
- [ ] Login simples (credentials, banco interno de usuários)
- [ ] Toda ação relevante associada a um usuário (auditoria mínima)

### Infraestrutura
- [ ] Banco particionado por UF desde a primeira migration
- [ ] Workers separados do processo web (mesmo que no MVP rodem na mesma VPS, em containers distintos)
- [ ] Schema `analytics` separado para qualquer agregação

## 🚫 NÃO entra no MVP (fica para depois, documentado para não esquecer)

| Feature | Por que fica de fora agora | Quando revisitar |
|---|---|---|
| Disparo de campanha de e-mail | Depende de validação jurídica (LGPD) e configuração de domínio/DNS | Fase 5, após MVP estável |
| Matching Places ↔ CNPJ com score | Complexidade alta, não é caminho crítico do MVP | Pós-MVP |
| Geocodificação em massa da base toda | Custo alto, só geocodificar sob demanda/lote pequeno | Conforme adoção |
| Multi-usuário com permissões granulares | Um nível de usuário "banker" basta por agora | Quando houver gestor pedindo |
| Dashboard de Analytics dentro do produto | Metabase já resolve isso fora do produto | Se o BI externo não bastar |
| Enriquecimento externo (BrasilAPI/CNPJ.ws) automático | Usar só sob demanda manual no MVP | Quando houver volume que justifique |
| App mobile nativo | Web responsivo é suficiente para validar | Se uso em campo comprovar necessidade |

## Critério de "pronto" do MVP

O MVP está pronto quando um banker consegue, **sem ajuda técnica**:
1. Buscar uma região
2. Filtrar CNPJs relevantes
3. Ver quantos encontrou
4. Exportar a lista completa
5. Fazer isso de novo no dia seguinte sem perder o que fez antes (histórico)

Tudo isso autenticado, rastreável, e sem travar com volume de produção real.

## Links relacionados
- [[00-Visao/Visao-Geral]]
- [[03-Fases-Desenvolvimento/Status-Atual]]
