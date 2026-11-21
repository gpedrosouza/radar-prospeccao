---
tags: [glossario]
---

# Termos do Domínio (Receita Federal / CNPJ)

| Termo | Significado |
|---|---|
| **CNPJ** | Cadastro Nacional da Pessoa Jurídica — 14 dígitos, identifica empresas no Brasil |
| **CNAE** | Classificação Nacional de Atividades Econômicas — código que descreve o ramo de atuação da empresa. Filtros por CNAE geralmente usam prefixo (ex: `6201` cobre `6201-5/01`, `6201-5/02`, etc.) |
| **Matriz/Filial** | CNPJs terminam em `/0001` (matriz) ou outros números (filiais). Importante para não duplicar contagem de "empresas únicas" quando o objetivo é matriz |
| **Situação cadastral** | Estado atual do CNPJ junto à Receita: `Ativa`, `Baixada`, `Inapta`, `Suspensa`, `Nula`. Só `Ativa` é normalmente relevante para prospecção |
| **Porte** | Classificação por tamanho: ME (microempresa), Pequeno, Médio, Grande — baseado em faturamento/capital declarado |
| **Simples Nacional** | Regime tributário simplificado para pequenas empresas — opcional, registrado na tabela `Simples.zip` da Receita |
| **MEI** | Microempreendedor Individual — subtipo dentro do Simples, para autônomos formalizados |
| **QSA** | Quadro de Sócios e Administradores — lista de sócios/representantes legais de um CNPJ, vem do arquivo `Socios*.zip` |
| **Natureza Jurídica** | Classificação legal da entidade (Sociedade Limitada, Sociedade Anônima, Empresário Individual, etc.) |
| **Capital Social** | Valor declarado como capital da empresa no registro |
| **Dados Abertos CNPJ** | Conjunto de arquivos públicos que a Receita Federal publica mensalmente em `arquivos.receitafederal.gov.br`, contendo a base completa de CNPJs do Brasil |

# Termos Técnicos

| Termo | Significado |
|---|---|
| **PostGIS** | Extensão do PostgreSQL para dados geoespaciais — usada para buscas por raio/distância |
| **Particionamento (LIST)** | Técnica de banco que divide uma tabela grande em sub-tabelas físicas (partições) baseado em um valor de coluna — aqui, a UF |
| **BullMQ** | Biblioteca de filas de jobs sobre Redis, usada para processar exportações e enriquecimentos em background |
| **SSE (Server-Sent Events)** | Protocolo simples para o servidor empurrar atualizações em tempo real pro navegador, sem precisar de WebSocket completo — usado aqui para progresso de exportação |
| **R2** | Object storage da Cloudflare, compatível com S3, sem taxa de egress (download) |
| **Cursor (paginação)** | Técnica de paginar resultados grandes usando um valor de referência (ex: último ID lido) em vez de `OFFSET`, que fica lento em tabelas grandes |
| **SPF / DKIM / DMARC** | Protocolos de autenticação de e-mail que provam que uma mensagem realmente vem do domínio que afirma ser a origem — ver [[02-Custos/Email-Dominio-Deliverability]] |
| **Webhook** | Mecanismo onde um serviço externo (ex: Resend) chama uma URL do seu backend quando um evento acontece (ex: e-mail recebido, bounce) |
| **ADR (Architecture Decision Record)** | Documento curto que registra uma decisão arquitetural, o porquê, e as alternativas descartadas — ver pasta `05-Decisoes-ADR/` |

## Links relacionados
- [[00-INDEX]]
