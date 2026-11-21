# DER — Documento de Especificação de Requisitos
## Radar de Prospecção Geográfica — v2.0

> **Classificação:** Interno · **Versão:** 1.0 · **Data:** Junho/2026
> **Autor:** Documentação gerada com base na análise completa do codebase

---

## 1. Visão Geral do Sistema

O **Radar de Prospecção Geográfica** é uma plataforma interna desenvolvida para que personal bankers identifiquem, qualifiquem e contactem empresas (CNPJs) dentro de uma área geográfica de cobertura, cruzando três fontes de dados:

1. **Base oficial da Receita Federal** (~66 milhões de CNPJs, atualizada mensalmente)
2. **Google Places API** (validação de atividade real no mapa)
3. **Geolocalização por raio** (PostGIS, pesquisa espacial sobre PostgreSQL)

O sistema permite ao banker, a partir de uma área desenhada no mapa, obter uma lista qualificada de empresas-alvo, exportá-la em CSV e disparar campanhas de e-mail segmentadas diretamente.

---

## 2. Partes Interessadas (Stakeholders)

| Stakeholder | Papel | Interesse principal |
|---|---|---|
| Personal Banker | Usuário primário | Prospectar empresas na sua área de cobertura de forma rápida e autônoma |
| Gestor Regional | Usuário secundário | Acompanhar campanhas e cobertura territorial da equipe |
| TI / Infraestrutura | Operacional | Estabilidade, performance, manutenibilidade |
| Jurídico / Compliance | Regulatório | Adequação à LGPD e regulamentos de comunicação comercial |
| Diretoria | Estratégico | ROI da ferramenta, expansão para novos mercados/UFs |

---

## 3. Requisitos Funcionais (RF)

### 3.1 Módulo de Autenticação

| ID | Requisito | Prioridade |
|---|---|---|
| RF-AUTH-01 | O sistema deve autenticar usuários por e-mail e senha (credentials provider) | Alta |
| RF-AUTH-02 | As senhas devem ser armazenadas com hash argon2id | Alta |
| RF-AUTH-03 | Sessões devem ser gerenciadas via JWT assinado com `AUTH_SECRET` | Alta |
| RF-AUTH-04 | Todas as rotas `/api/*` (exceto `/api/health`) devem exigir autenticação | Alta |
| RF-AUTH-05 | O sistema deve suportar dois papéis: `banker` e `admin` | Média |
| RF-AUTH-06 | Usuários não autenticados devem receber HTTP 401 com body JSON padronizado | Alta |

### 3.2 Módulo de Mapa e Busca Geográfica

| ID | Requisito | Prioridade |
|---|---|---|
| RF-MAP-01 | O sistema deve exibir um mapa interativo (Google Maps JS API) | Alta |
| RF-MAP-02 | O banker deve poder buscar uma cidade ou endereço como ponto de origem | Alta |
| RF-MAP-03 | O banker deve poder definir um raio de busca em quilômetros (slider, 1–500 km) | Alta |
| RF-MAP-04 | O sistema deve exibir um círculo no mapa representando a área de cobertura | Alta |
| RF-MAP-05 | O sistema deve buscar municípios dentro do raio via PostGIS (`ST_DWithin`) | Alta |
| RF-MAP-06 | O sistema deve exibir marcadores no mapa para CNPJs geocodificados dentro do raio | Alta |
| RF-MAP-07 | O sistema deve consultar o Google Places API para exibir empresas presentes no mapa | Alta |
| RF-MAP-08 | Resultados do Google Places devem ser cacheados por célula de grid geográfico (0,1°) | Alta |
| RF-MAP-09 | O cache de Places deve ter TTL configurável (padrão: 30 dias) | Média |

### 3.3 Módulo de Busca e Filtro de CNPJs

| ID | Requisito | Prioridade |
|---|---|---|
| RF-CNPJ-01 | O sistema deve permitir filtrar CNPJs por UF | Alta |
| RF-CNPJ-02 | O sistema deve permitir filtrar por situação cadastral (ex: "Ativa") | Alta |
| RF-CNPJ-03 | O sistema deve permitir filtrar por prefixo de CNAE (até 7 dígitos) | Alta |
| RF-CNPJ-04 | O sistema deve permitir filtrar por porte da empresa (ME, EPP, Grande, etc.) | Alta |
| RF-CNPJ-05 | O sistema deve permitir filtrar por tipo (MATRIZ / FILIAL) | Alta |
| RF-CNPJ-06 | O sistema deve permitir filtrar por Simples Nacional (booleano) | Alta |
| RF-CNPJ-07 | O sistema deve permitir filtrar por MEI (booleano) | Alta |
| RF-CNPJ-08 | O sistema deve permitir filtrar por intervalo de data de abertura (YYYY-MM-DD) | Média |
| RF-CNPJ-09 | Os resultados devem ser paginados por cursor (cursor-based pagination) | Alta |
| RF-CNPJ-10 | A contagem de resultados deve ter um teto de 10.000 para uso em UI (contagem com cap) | Alta |
| RF-CNPJ-11 | Acima do teto, o sistema deve informar "mais de 10.000 resultados" | Alta |
| RF-CNPJ-12 | Todos os filtros ativos devem ser refletidos na URL (query params compartilháveis) | Alta |
| RF-CNPJ-13 | O sistema deve exibir chips de filtros ativos com botão de remoção individual | Alta |
| RF-CNPJ-14 | Os filtros devem ser preservados ao navegar entre as telas Mapa e CNPJs | Alta |

### 3.4 Módulo de Exportação

| ID | Requisito | Prioridade |
|---|---|---|
| RF-EXP-01 | O sistema deve permitir exportar os CNPJs filtrados em formato CSV comprimido (gzip) | Alta |
| RF-EXP-02 | A exportação deve ser assíncrona (via fila BullMQ), nunca síncrona | Alta |
| RF-EXP-03 | O progresso da exportação deve ser comunicado em tempo real via Server-Sent Events (SSE) | Alta |
| RF-EXP-04 | O arquivo exportado deve ser armazenado em Cloudflare R2 (ou MinIO em dev) | Alta |
| RF-EXP-05 | O download deve ser disponibilizado via URL pré-assinada com TTL de 4 horas (configurável) | Alta |
| RF-EXP-06 | O histórico de exportações do usuário deve ser listável | Alta |
| RF-EXP-07 | Cada usuário deve poder ter no máximo 5 exportações simultâneas (queued + running) | Alta |
| RF-EXP-08 | Cada usuário deve estar limitado a 10 exportações por hora (rate limiting via Redis) | Alta |
| RF-EXP-09 | Erros de rate limit devem retornar HTTP 429 com mensagem clara | Alta |
| RF-EXP-10 | Cada exportação deve registrar filtros, status, progresso e usuário (auditoria) | Alta |

### 3.5 Módulo de Campanhas de E-mail

| ID | Requisito | Prioridade |
|---|---|---|
| RF-EMAIL-01 | O sistema deve permitir criar uma campanha de e-mail a partir dos filtros de CNPJ | Alta |
| RF-EMAIL-02 | A campanha deve ter nome, assunto e corpo com variáveis de template | Alta |
| RF-EMAIL-03 | Variáveis suportadas: `{{razao_social}}`, `{{nome_fantasia}}`, `{{cnpj}}`, `{{cnpj_formatado}}`, `{{municipio_nome}}`, `{{uf}}`, `{{cnae_principal}}`, `{{link_descadastro}}` | Alta |
| RF-EMAIL-04 | E-mails com bounce permanente (hard) nunca devem receber novas campanhas | Alta |
| RF-EMAIL-05 | E-mails descadastrados devem ser permanentemente excluídos de todas as campanhas futuras | Alta |
| RF-EMAIL-06 | Toda campanha deve incluir link de descadastro (one-click, RFC 8058) | Alta |
| RF-EMAIL-07 | O disparo deve ser assíncrono via BullMQ, com delay configurável entre envios | Alta |
| RF-EMAIL-08 | O status de cada destinatário deve ser rastreado: pendente → enviado → aberto → clicado → respondido / bounced | Alta |
| RF-EMAIL-09 | O sistema deve processar webhooks do Resend (bounce, complaint, delivered, opened, clicked, received) | Alta |
| RF-EMAIL-10 | Um spam complaint deve gerar bounce permanente + unsubscribe obrigatório | Alta |
| RF-EMAIL-11 | O histórico de campanhas do usuário deve ser listável com métricas (taxa de abertura, clique, resposta) | Alta |
| RF-EMAIL-12 | A campanha deve exibir aviso LGPD fixo (não dismissable) em todas as superfícies de disparo | Alta |
| RF-EMAIL-13 | Status da campanha: rascunho → enviando → concluida / falhou | Alta |
| RF-EMAIL-14 | Ao disparar, o sistema deve reconstruir a lista de destinatários com exclusões atualizadas | Alta |

### 3.6 Módulo de Saúde e Monitoramento

| ID | Requisito | Prioridade |
|---|---|---|
| RF-HEALTH-01 | Deve existir uma rota `GET /api/health` pública (sem autenticação) | Alta |
| RF-HEALTH-02 | A rota de health deve verificar Postgres e Redis em paralelo | Alta |
| RF-HEALTH-03 | A rota de health deve retornar HTTP 200 com `{"status":"ok"}` quando tudo estiver saudável | Alta |
| RF-HEALTH-04 | A rota de health deve retornar HTTP 503 com detalhes do serviço que falhou | Alta |

### 3.7 Módulo de Importação de Dados (Workers)

| ID | Requisito | Prioridade |
|---|---|---|
| RF-IMP-01 | O sistema deve importar a base de CNPJs da Receita Federal via arquivos ZIP | Alta |
| RF-IMP-02 | A importação deve usar `COPY` streaming para eficiência com 66M de registros | Alta |
| RF-IMP-03 | A importação deve usar staging tables para evitar lock na tabela de produção | Alta |
| RF-IMP-04 | O sistema deve suportar geocodificação em lote de CNPJs via Google Geocoding API | Alta |
| RF-IMP-05 | O sistema deve manter schema `analytics` com views materializadas (resgate por batch) | Média |
| RF-IMP-06 | O sistema deve fazer backup automático do Postgres para R2 (cron, diário às 03:00 UTC) | Alta |

---

## 4. Requisitos Não-Funcionais (RNF)

### 4.1 Performance

| ID | Requisito | Métrica alvo |
|---|---|---|
| RNF-PERF-01 | Busca de CNPJs com filtro de UF deve responder em < 2s | P95 < 2s |
| RNF-PERF-02 | Busca de cidades no raio (PostGIS) deve responder em < 500ms | P95 < 500ms |
| RNF-PERF-03 | Busca de Places (com cache) deve responder em < 300ms | P95 < 300ms |
| RNF-PERF-04 | A UI nunca deve disparar queries de agregação diretas sobre `company_cnpj` | Sem exceções |
| RNF-PERF-05 | Toda query de paginação sobre `company_cnpj` deve incluir filtro de `uf` (partition pruning) | Sem exceções |
| RNF-PERF-06 | Exportação de 100.000 registros deve completar em < 5 minutos | 100k < 5min |
| RNF-PERF-07 | O worker de exportação não deve carregar todos os registros em memória (cursor-based streaming) | Sem buffering total |

### 4.2 Escalabilidade

| ID | Requisito | Detalhe |
|---|---|---|
| RNF-ESC-01 | O banco deve suportar ~66M de registros na tabela `company_cnpj` sem degradação | Particionamento por LIST(uf) |
| RNF-ESC-02 | Os workers devem escalar horizontalmente sem alteração de código | Múltiplos consumers BullMQ |
| RNF-ESC-03 | O processo `web` não deve sofrer impacto de jobs pesados (isolamento via workers) | Containers separados |

### 4.3 Confiabilidade

| ID | Requisito | Detalhe |
|---|---|---|
| RNF-REL-01 | Jobs de exportação devem ter retry automático (3 tentativas, backoff exponencial de 5s) | BullMQ config |
| RNF-REL-02 | Falhas individuais de envio de e-mail não devem abortar a campanha | Worker resiliente |
| RNF-REL-03 | O banco deve ter backup diário automático com retenção de 7 dias (diário) e 30 dias (semanal) | pg_dump → R2 |
| RNF-REL-04 | O restore do backup deve ser testado e validado antes de ir para produção | Procedimento documentado |
| RNF-REL-05 | Workers devem finalizar graciosamente ao receber SIGTERM (graceful shutdown) | SIGTERM handler |

### 4.4 Segurança

| ID | Requisito | Detalhe |
|---|---|---|
| RNF-SEG-01 | Todas as comunicações devem ser protegidas por HTTPS (TLS via Caddy + Let's Encrypt) | Obrigatório em produção |
| RNF-SEG-02 | Secrets nunca devem ser commitados no repositório | `.env.local` no `.gitignore` |
| RNF-SEG-03 | PostgreSQL e Redis não devem ser expostos externamente | Somente rede Docker interna |
| RNF-SEG-04 | Chaves do Google Maps devem ser separadas (frontend: restrita por HTTP referrer; backend: restrita por IP) | Duas chaves distintas |
| RNF-SEG-05 | Webhooks do Resend devem ter assinatura SVIX verificada com resistência a timing attacks | `timingSafeEqual` |
| RNF-SEG-06 | Tokens de descadastro devem ser HMAC-SHA256 com segredo dedicado (`UNSUBSCRIBE_TOKEN_SECRET`) | Não adivinhável |
| RNF-SEG-07 | Rate limiting deve ser aplicado nas rotas de exportação e potencialmente em todas as rotas críticas | Redis INCR + expire |

### 4.5 Usabilidade

| ID | Requisito | Detalhe |
|---|---|---|
| RNF-USA-01 | A interface deve ser utilizável por bankers sem perfil técnico | UX simplificada |
| RNF-USA-02 | A interface deve ser responsiva (mobile e desktop) | CSS responsivo |
| RNF-USA-03 | O tempo de feedback para qualquer ação deve ser < 3s ou ter indicador de progresso | Feedback visual |
| RNF-USA-04 | Filtros devem ser compartilháveis via URL (query params) | URL state |

### 4.6 Manutenibilidade

| ID | Requisito | Detalhe |
|---|---|---|
| RNF-MAN-01 | O código deve seguir TypeScript strict sem `any` não justificado | `tsconfig strict: true` |
| RNF-MAN-02 | Todo service e repository deve ter testes Vitest correspondentes | Cobertura de negócio |
| RNF-MAN-03 | `apps/web` e `apps/workers` nunca devem importar um do outro | ESLint `no-restricted-imports` |
| RNF-MAN-04 | Rotas de API nunca devem acessar o Prisma diretamente | Camada service/repository obrigatória |
| RNF-MAN-05 | Commits devem seguir Conventional Commits (`feat:`, `fix:`, `chore:`, etc.) | Convenção de projeto |

---

## 5. Regras de Negócio (RN)

| ID | Regra | Justificativa |
|---|---|---|
| RN-01 | A tabela `company_cnpj` é particionada por LIST(uf) com 27 partições. Qualquer `ALTER TABLE` exige migration SQL manual — nunca usar `prisma migrate dev` para essa tabela. | `prisma migrate dev` gera DDL sem `PARTITION BY` |
| RN-02 | Jobs longos (exportação, geocodificação, envio de e-mail) SEMPRE via fila BullMQ, nunca processamento síncrono em rota de API. | Evitar que jobs pesados travem a UI |
| RN-03 | Arquivos de exportação vão para Cloudflare R2 (nunca para disco local do container). | Stateless, sem disco persistente no container |
| RN-04 | Queries de UI nunca agregam diretamente sobre `company_cnpj`. Agregações usam o schema `analytics`. | Performance — COUNT(*) em 66M rows sem índice leva segundos |
| RN-05 | Toda query de listagem/paginação sobre `company_cnpj` deve incluir o filtro `uf` para ativar partition pruning. | Performance — sem `uf`, o planner faz scan nas 27 partições |
| RN-06 | E-mails com bounce permanente ou soft NUNCA podem receber novas campanhas. | Proteção de reputação do remetente + compliance LGPD |
| RN-07 | E-mails descadastrados NUNCA podem receber novas campanhas, permanentemente. | Requisito legal + RFC 8058 |
| RN-08 | O sistema verifica bounces e unsubscribes ANTES de criar qualquer lista de destinatários (`buildRecipientList`). | Essa checagem não é opcional — é parte do fluxo. |
| RN-09 | A contagem de resultados na UI é limitada a 10.000 (cap). Acima disso, exibe "mais de 10.000". | Evitar COUNT(*) de longa duração em tempo real |
| RN-10 | Spam complaints geram bounce permanente (hard) E unsubscribe obrigatório do endereço reclamante. | Exigência Gmail/Yahoo + preservação de reputação |
| RN-11 | O status de um destinatário de e-mail só "sobe" pelo funil de engajamento — nunca retroage. Exceto `bounced`, que sempre sobrescreve. | Estado de engajamento é imutável para baixo |
| RN-12 | Exportações têm limite de 5 simultâneas e 10 por hora por usuário. | Proteger recursos de banco e worker |
| RN-13 | A lista de destinatários de uma campanha é reconstruída com exclusões atualizadas no momento do disparo (não apenas na criação). | Bounces e unsubscribes ocorridos após criação devem ser respeitados |
| RN-14 | Toda exportação e todo disparo de campanha deve registrar o usuário, timestamp e filtros utilizados. | Rastreabilidade — exigível para compliance |

---

## 6. Casos de Uso (UC)

### UC-01: Buscar Empresas por Área Geográfica

**Ator:** Personal Banker
**Pré-condição:** Banker autenticado no sistema

**Fluxo principal:**
1. Banker acessa a tela Mapa.
2. Banker busca uma cidade ou endereço como ponto de origem (Google Places Autocomplete).
3. Sistema centraliza o mapa na localização escolhida.
4. Banker ajusta o slider de raio (ex: 40 km).
5. Sistema exibe círculo de cobertura e consulta `GET /api/cities/radius`.
6. Sistema exibe marcadores de CNPJs geocodificados dentro do raio.
7. Sistema consulta `GET /api/places/companies` para exibir pontos do Google Places.

**Fluxo alternativo:** Se nenhum município for encontrado no raio, o sistema usa o código IBGE da cidade de referência como fallback.

---

### UC-02: Filtrar e Visualizar CNPJs

**Ator:** Personal Banker
**Pré-condição:** Área geográfica definida (UC-01)

**Fluxo principal:**
1. Banker acessa a tela CNPJs (ou painel de filtros no Mapa).
2. Banker aplica filtros: situação = "Ativa", CNAE = "641" (bancos).
3. Sistema consulta `GET /api/cnpj/companies` com os filtros.
4. Sistema exibe tabela paginada e contagem (ou "mais de 10.000").
5. Banker vê chips dos filtros ativos na barra superior.
6. Banker pode remover filtros individualmente pelos chips.
7. URL é atualizada com todos os filtros — banker pode copiar e compartilhar.

---

### UC-03: Exportar CNPJs para CSV

**Ator:** Personal Banker
**Pré-condição:** Filtros aplicados (UC-02)

**Fluxo principal:**
1. Banker clica em "Exportar CSV".
2. Sistema cria job via `POST /api/cnpj/export-jobs` e responde com jobId.
3. Frontend abre conexão SSE em `/api/cnpj/export-jobs/{id}/stream`.
4. Worker processa: pagina `company_cnpj` → gera CSV → gzip → upload para R2.
5. Worker atualiza progresso_pct a cada lote processado.
6. SSE empurra eventos de progresso para o frontend.
7. Ao concluir, SSE envia evento `completed` com `downloadUrl`.
8. Banker clica em "Baixar" e recebe o CSV via URL pré-assinada.

**Fluxo alternativo (rate limit):** Se o banker já tem 5 exportações em andamento ou excedeu 10/hora, sistema retorna 429 com mensagem descritiva.

---

### UC-04: Criar e Disparar Campanha de E-mail

**Ator:** Personal Banker
**Pré-condição:** Filtros aplicados (UC-02); validação jurídica LGPD aprovada

**Fluxo principal:**
1. Banker acessa a tela Campanhas.
2. Banker preenche nome, assunto e corpo do e-mail com variáveis de template.
3. Sistema exibe pré-visualização do e-mail renderizado.
4. Banker confirma no modal de confirmação (aviso LGPD exibido).
5. Sistema cria campanha via `POST /api/campaigns` (status: rascunho).
6. Banker clica em "Enviar" — sistema chama `POST /api/campaigns/{id}/send`.
7. Sistema reconstrói lista de destinatários com exclusões frescas.
8. Sistema enfileira job de envio via BullMQ (jobId = campaignId, idempotente).
9. Worker envia e-mails com delay configurável entre envios.
10. Webhooks do Resend atualizam status de cada destinatário em tempo real.

**Fluxo alternativo:** Se não houver destinatários elegíveis após exclusões, sistema retorna 422 com mensagem explicativa.

---

### UC-05: Monitorar Progresso de Campanha

**Ator:** Personal Banker
**Pré-condição:** Campanha disparada (UC-04)

**Fluxo principal:**
1. Banker acessa a tela Campanhas.
2. Sistema exibe lista de campanhas com stats: total enviados, bounces, taxa de abertura, clique e resposta.
3. Banker visualiza painel de histórico com mini-métricas.

---

### UC-06: Descadastrar-se de Campanhas

**Ator:** Destinatário de e-mail (empresa que recebeu campanha)
**Pré-condição:** Empresa recebeu e-mail de campanha

**Fluxo principal:**
1. Destinatário clica em link de descadastro no rodapé do e-mail.
2. Sistema valida token HMAC-SHA256 via `GET /api/unsubscribe`.
3. Sistema exibe confirmação de descadastro.
4. Destinatário confirma via `POST /api/unsubscribe` (one-click RFC 8058).
5. Sistema registra e-mail em `email_unsubscribes`.
6. E-mail não recebe mais nenhuma campanha futura.

---

## 7. User Stories

### Epic 1: Autenticação e Acesso

**US-001** — Como banker, quero fazer login com meu e-mail e senha para acessar o sistema de forma segura.
*Critérios de aceite: login com credenciais válidas redireciona para /mapa; credenciais inválidas exibem mensagem de erro; senha armazenada com argon2id.*

**US-002** — Como banker, quero que minha sessão seja mantida entre recarregamentos de página para não precisar fazer login a cada acesso.
*Critérios de aceite: JWT válido por sessão configurável; recarregamento da página mantém sessão ativa.*

---

### Epic 2: Mapa e Geolocalização

**US-010** — Como banker, quero buscar uma cidade pelo nome no campo de busca do mapa para definir minha área de cobertura.
*Critérios de aceite: autocompletar com Google Places; mapa centraliza no resultado selecionado.*

**US-011** — Como banker, quero ajustar o raio de busca com um slider para definir exatamente a área que quero prospectar.
*Critérios de aceite: slider de 1 a 500 km; círculo no mapa atualiza em tempo real.*

**US-012** — Como banker, quero ver marcadores no mapa das empresas geocodificadas para ter uma visão geográfica das oportunidades.
*Critérios de aceite: marcadores coloridos por situação cadastral; clique exibe informações básicas.*

**US-013** — Como banker, quero ver pontos do Google Places sobrepostos ao mapa para validar se as empresas ainda estão ativas.
*Critérios de aceite: resultados do Google Places exibidos como marcadores; cacheados por 30 dias por célula de grid.*

---

### Epic 3: Busca e Filtros de CNPJ

**US-020** — Como banker, quero filtrar CNPJs por situação cadastral "Ativa" para focar apenas em empresas operando.
*Critérios de aceite: filtro de situação funcional; refletido em URL; removível via chip.*

**US-021** — Como banker, quero filtrar por CNAE para prospectar um segmento específico de mercado.
*Critérios de aceite: campo de texto para prefixo de CNAE (até 7 dígitos); suporte a busca por prefixo.*

**US-022** — Como banker, quero ver quantas empresas correspondem aos meus filtros para dimensionar o potencial da área.
*Critérios de aceite: contagem exibida em tempo real; "mais de 10.000" quando acima do teto.*

**US-023** — Como banker, quero compartilhar minha busca com um colega enviando o link da página para colaborar na prospecção.
*Critérios de aceite: URL contém todos os filtros ativos; copiar e colar URL reproduz exatamente a mesma busca.*

**US-024** — Como banker, quero remover filtros individualmente pelos chips sem precisar reconfigurar tudo do zero.
*Critérios de aceite: chips exibem filtros ativos; × em cada chip remove aquele filtro; demais filtros mantidos.*

---

### Epic 4: Exportação

**US-030** — Como banker, quero exportar a lista completa de CNPJs filtrados em CSV para usar em outras ferramentas.
*Critérios de aceite: botão de exportação; processamento assíncrono; progresso visível.*

**US-031** — Como banker, quero ver o progresso da exportação em tempo real para saber quando o arquivo estará pronto.
*Critérios de aceite: barra de progresso atualiza a cada segundo; sem recarregamento de página.*

**US-032** — Como banker, quero baixar o arquivo exportado quando estiver pronto para utilizá-lo.
*Critérios de aceite: botão de download disponível ao concluir; URL pré-assinada com validade de 4 horas.*

**US-033** — Como banker, quero ver o histórico das minhas exportações para acessar arquivos gerados anteriormente.
*Critérios de aceite: lista de exportações com status, data, tamanho e filtros usados.*

---

### Epic 5: Campanhas de E-mail

**US-040** — Como banker, quero criar uma campanha de e-mail com assunto e corpo personalizados para prospectar empresas da minha lista.
*Critérios de aceite: formulário de criação com preview; variáveis de template disponíveis.*

**US-041** — Como banker, quero usar o nome da empresa no corpo do e-mail para tornar a mensagem mais pessoal.
*Critérios de aceite: variável `{{razao_social}}` substituída corretamente no envio.*

**US-042** — Como banker, quero que e-mails de empresas descadastradas não sejam enviados em campanhas futuras.
*Critérios de aceite: descadastros verificados antes de cada envio; lista de destinatários reconstruída ao disparar.*

**US-043** — Como banker, quero ver as métricas de abertura e clique das campanhas enviadas para avaliar a efetividade.
*Critérios de aceite: taxa de abertura, clique, resposta e bounce exibidas por campanha.*

---

## 8. Protótipos de Tela (Referências)

As implementações das seguintes telas estão no codebase:

| Tela | Localização |
|---|---|
| Login | `apps/web/src/app/login/page.tsx` |
| Mapa | `apps/web/src/app/(app)/mapa/` |
| CNPJs | `apps/web/src/app/(app)/cnpjs/` |
| Exportações | `apps/web/src/app/(app)/exportacoes/` |
| Campanhas | `apps/web/src/app/(app)/campanhas/` |

---

## 9. Glossário

| Termo | Definição |
|---|---|
| CNPJ | Cadastro Nacional da Pessoa Jurídica — identificador único de empresa no Brasil |
| CNAE | Classificação Nacional de Atividades Econômicas — código que identifica o ramo de atividade |
| UF | Unidade Federativa — sigla do estado brasileiro (SP, RJ, etc.) |
| Partition Pruning | Otimização do PostgreSQL que descarta partições irrelevantes quando o filtro inclui a chave de partição |
| Cursor-based Pagination | Paginação usando o ID do último registro como cursor (mais estável que OFFSET em tabelas grandes) |
| SSE | Server-Sent Events — protocolo para envio de eventos unidirecionais do servidor para o browser |
| BullMQ | Biblioteca de filas para Node.js baseada em Redis |
| R2 | Cloudflare R2 — armazenamento de objetos compatível com S3 e sem taxa de egress |
| Bounce (Hard) | Falha permanente de entrega de e-mail (endereço inválido, domínio inexistente) |
| Bounce (Soft) | Falha temporária de entrega (caixa cheia, servidor indisponível) |
| SVIX | Plataforma de webhooks usada pelo Resend para assinatura e entrega de eventos |
| LGPD | Lei Geral de Proteção de Dados Pessoais (Lei nº 13.709/2018) |

---

*Fim do DER — próxima revisão recomendada: ao iniciar desenvolvimento de qualquer nova feature.*
