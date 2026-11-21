# Knowledge Base — Radar de Prospecção Geográfica
## Base de Conhecimento · Troubleshooting · FAQ Técnico

> Para dúvidas de uso do dia a dia, consulte o **Manual do Usuário**. Esta base de conhecimento é voltada para casos de uso avançados, troubleshooting técnico e perguntas operacionais.

---

## KB-001 — CNAEs Mais Relevantes para Prospecção Bancária

Os primeiros 2 dígitos do CNAE definem a seção. Use no campo "Prefixo CNAE" do sistema:

| Prefixo | Setor | Produtos bancários típicos |
|---|---|---|
| `64` | Serviços financeiros | Capital de giro, crédito consignado PJ |
| `47` | Comércio varejista | Antecipação de recebíveis, maquininha |
| `45` | Comércio veículos | Financiamento de frota |
| `41` | Construção | Crédito imobiliário PJ, financiamento de equipamentos |
| `56` | Alimentação | Conta PJ, maquininha, capital de giro |
| `62` | TI e software | Conta PJ, câmbio, hedge |
| `86` | Saúde | Crédito PJ, antecipação de convênios |
| `43` | Serviços especializados para construção | Financiamento de equipamentos |
| `49` | Transporte terrestre | Financiamento de frota, seguro |
| `35` | Energia elétrica e gás | Crédito para infraestrutura |
| `01` | Agropecuária | Crédito rural, custeio, investimento |

**CNAEs específicos de alta conversão:**
- `6422100` — Bancos múltiplos (concorrentes — evitar ou abordar para co-marketing)
- `4711301` — Comércio varejista de produtos alimentícios (supermercados)
- `4512901` — Representantes comerciais de veículos
- `8630502` — Atividade médica ambulatorial restrita a consultas
- `6201501` — Desenvolvimento de software

---

## KB-002 — Entendendo o Porte das Empresas

| Porte | Faturamento Bruto Anual | Perfil de produto |
|---|---|---|
| MEI | Até R$ 81.000 | Conta corrente PJ básica, cartão |
| ME (Microempresa) | Até R$ 360.000 | Conta PJ, limite de crédito pequeno |
| EPP (Pequeno Porte) | Até R$ 4,8 milhões | Capital de giro, antecipação, investimentos |
| Médio | Até R$ 300 milhões | Crédito estruturado, câmbio, derivativos |
| Grande | Acima de R$ 300 milhões | Banco de atacado, mercado de capitais |

**Observação:** O porte na Receita Federal é autodeclarado e pode estar desatualizado. Use como orientação, não como verdade absoluta.

---

## KB-003 — Regimes Tributários e Prospecção

| Regime | O que significa | Relevância |
|---|---|---|
| Simples Nacional | Regime unificado, alíquota simplificada | Alta receptividade a produtos simples de PJ |
| Lucro Presumido | Regime intermediário | Perfil mais sofisticado; abertura a produtos de crédito |
| Lucro Real | Regime completo, empresas maiores | Maior complexidade financeira; oportunidade para tesouraria |
| MEI | Microempreendedor Individual | Volume alto, ticket baixo |

No sistema: "Simples Nacional = Sim" + "MEI = Não" = empresas entre R$81k e R$4,8M em regime Simples.

---

## KB-004 — Tipos de Estabelecimento: Matriz vs. Filial

| Tipo | O que é | Quando prospectar |
|---|---|---|
| MATRIZ | Sede principal da empresa | Decisões financeiras costumam ser tomadas aqui |
| FILIAL | Unidade secundária | Contato operacional; decisão financeira pode estar na matriz |

**Dica de prospecção:** Para empresas de médio e grande porte, priorize a MATRIZ — é onde fica o diretor financeiro. Para empresas menores (MEI, ME), a filial muitas vezes tem o mesmo responsável.

No sistema: filtrar por "MATRIZ" reduz duplicidade na prospecção (a mesma empresa com 10 filiais apareceria 10 vezes sem o filtro).

---

## KB-005 — Troubleshooting: Mapa não carrega

**Sintomas:** Mapa em branco, spinner infinito, ou mensagem "Falha ao carregar mapa".

**Causas e soluções:**

1. **Chave do Google Maps inválida ou expirada**
   - Sinal: Console do browser mostra `Google Maps JS API error: InvalidKeyMapError`
   - Solução: Contatar TI para verificar a chave no Google Cloud Console

2. **Limite de cota atingido**
   - Sinal: Console mostra `Google Maps JS API error: OverQuotaMapError`
   - Solução: Aguardar o reset diário da cota (meia-noite PT) ou contatar TI

3. **Sem conexão com internet**
   - Teste: Tente acessar google.com no mesmo browser
   - Solução: Verifique sua conexão

4. **Browser desatualizado**
   - O sistema requer Chrome 90+, Firefox 88+, Safari 14+, Edge 90+
   - Solução: Atualizar o browser

---

## KB-006 — Troubleshooting: Exportação trava em X%

**Sintomas:** A barra de progresso para de avançar por mais de 10 minutos.

**Causas e soluções:**

1. **Worker de exportação não está rodando**
   - Diagnóstico (TI): `docker logs radar_worker_export --tail=50`
   - Solução: Reiniciar o container `docker compose restart worker-export`

2. **Redis indisponível**
   - Diagnóstico (TI): Verificar `/api/health` — campo `redis`
   - Solução: `docker compose restart redis`

3. **Volume muito grande sem filtros suficientes**
   - Sinal: Travou próximo de 0%
   - Solução: Cancelar (recarregar a página) e adicionar mais filtros (especialmente UF)

4. **Erro de conexão com R2/MinIO**
   - Diagnóstico: Logs do worker mostram `S3ServiceException`
   - Solução: Verificar credenciais R2 nas variáveis de ambiente

---

## KB-007 — Troubleshooting: Contagem de CNPJs retorna 0

**Sintomas:** Sistema exibe "0 empresas encontradas" mesmo para regiões com muitas empresas.

**Causas mais comuns:**

1. **Combinação de filtros muito restritiva**
   - Tente remover filtros um a um pelos chips para identificar qual está causando o problema
   - CNAE muito específico (7 dígitos) pode ter poucos registros

2. **Raio muito pequeno para região rural**
   - Municípios rurais têm centróides geográficos que podem estar fora de um raio pequeno
   - Tente aumentar o raio

3. **Situação configurada incorretamente**
   - Verifique se o filtro de situação não está definido para um valor que não existe na base
   - A base usa "Ativa" (com maiúscula) — não "ativa" ou "ATIVA"

4. **Banco de dados não populado**
   - Se o sistema foi instalado recentemente e a importação da Receita ainda não foi feita
   - Diagnóstico: Contatar TI para verificar se a importação foi executada

---

## KB-008 — Troubleshooting: E-mail de campanha caiu em spam

**Causas e mitigações:**

1. **SPF/DKIM/DMARC não configurados no domínio**
   - É a causa mais comum em 2026
   - Diagnóstico: Usar Google Admin Toolbox (toolbox.googleapps.com) para verificar registros DNS
   - Solução: Seguir guia de configuração DNS do Resend

2. **Taxa de spam muito alta**
   - Se mais de 0,3% dos destinatários marcaram como spam, o Gmail degrada a entregabilidade
   - Monitorar no Resend Dashboard
   - Mitigação: Melhore o conteúdo do e-mail, torne-o mais personalizado

3. **Domínio sem reputação (novo)**
   - Novos domínios não têm reputação estabelecida
   - Prática: "warm-up" — comece enviando para poucos destinatários e aumente gradualmente

4. **Conteúdo com palavras-chave de spam**
   - Evitar: "GRÁTIS", "CLIQUE AQUI", excesso de maiúsculas, múltiplos pontos de exclamação
   - Testar o e-mail em mail-tester.com antes do disparo real

5. **Link de descadastro ausente**
   - Gmail e Yahoo podem classificar como spam automaticamente
   - O sistema insere o link automaticamente, mas verifique se está no template

---

## KB-009 — Procedimento de Restore do Backup

**Quando usar:** Falha catastrófica do banco de dados, dados corrompidos, acidente de operação.

**Tempo estimado:** 30 minutos a 4 horas dependendo do tamanho do banco.

```bash
# 1. Identificar o backup desejado no R2 (bucket radar-backups)
# Nomenclatura: backup_YYYYMMDD_HHMMSS.sql.gz

# 2. Baixar o backup
aws s3 cp s3://radar-backups/backup_20260626_030000.sql.gz /tmp/

# 3. Parar o app (para evitar escritas durante o restore)
docker compose -f docker-compose.prod.yml stop web worker-export

# 4. Descomprir e restaurar
gunzip < /tmp/backup_20260626_030000.sql.gz | \
  docker exec -i radar_postgres pg_restore \
  -U radar -d radar_db --clean --if-exists

# 5. Verificar integridade
docker exec radar_postgres psql -U radar -d radar_db \
  -c "SELECT COUNT(*) FROM users;"

# 6. Reiniciar o app
docker compose -f docker-compose.prod.yml start web worker-export
```

**Script automatizado disponível em:** `apps/workers/src/scripts/restore-postgres.ts`

---

## KB-010 — Procedimento de Importação da Receita Federal

**Frequência:** Mensal (Receita publica nova base a cada mês)

**Onde baixar:** https://dados.rfb.gov.br/CNPJ/

```bash
# 1. Baixar os ZIPs da Receita (aproximadamente 2–3 GB comprimidos)
# Arquivos necessários: Empresas, Estabelecimentos, Sócios, Simples, CNAEs, etc.

# 2. Executar o importador (dentro da VPS ou de uma máquina com acesso ao banco)
npx tsx apps/workers/src/scripts/import-receita/index.ts /caminho/para/zips/

# 3. Aguardar conclusão (~2–4 horas para a base completa, dependendo do hardware)

# 4. Rodar ANALYZE para atualizar estatísticas
docker exec radar_postgres psql -U radar -d radar_db -c "ANALYZE company_cnpj;"

# 5. Atualizar analytics
npx tsx apps/workers/src/scripts/analytics/refresh.ts

# 6. (Opcional) Geocodificar novos CNPJs sem coordenadas
npx tsx apps/workers/src/scripts/geocode-cnpj.ts
```

**Estimativa de tempo para 66M registros:**
- Download dos ZIPs: 20–40 min (depende da conexão)
- Import + staging: 2–4 horas
- ANALYZE: 30–60 min
- Geocodificação parcial (100k registros): 4–8 horas

---

## KB-011 — Monitoramento e Alertas

### Endpoints de saúde

```
GET /api/health
→ {"status":"ok","postgres":"ok","redis":"ok"}
```

### Configuração UptimeRobot (gratuito)
1. Acesse uptimerobot.com
2. Crie monitor HTTP(S) apontando para `https://seu-dominio.com/api/health`
3. Configure alertas por e-mail para o administrador
4. Frequência: a cada 5 minutos

### Logs dos containers

```bash
# Todos os logs em tempo real
docker compose -f docker-compose.prod.yml logs -f

# Apenas o worker de exportação
docker logs radar_worker_export -f --tail=100

# Apenas o app web
docker logs radar_web -f --tail=100

# Buscar erros específicos
docker logs radar_web 2>&1 | grep "ERROR\|error\|Error"
```

### Métricas de banco de dados

```sql
-- Tamanho de cada partição
SELECT
  tablename,
  pg_size_pretty(pg_total_relation_size(tablename::regclass)) as tamanho
FROM pg_tables
WHERE tablename LIKE 'company_cnpj_%'
ORDER BY pg_total_relation_size(tablename::regclass) DESC;

-- Queries mais lentas
SELECT query, mean_exec_time, calls
FROM pg_stat_statements
ORDER BY mean_exec_time DESC
LIMIT 10;

-- Status das conexões
SELECT state, count(*) FROM pg_stat_activity GROUP BY state;
```

---

## KB-012 — Tabela de Códigos de Situação Cadastral (Receita Federal)

| Código | Situação | O que significa |
|---|---|---|
| 01 | NULA | Registro nulo — não usar |
| 02 | ATIVA | Empresa em funcionamento regular |
| 03 | SUSPENSA | Atividade suspensa temporariamente |
| 04 | INAPTA | Não entrega declarações há mais de 2 anos |
| 05 | BAIXADA | Empresa encerrada |
| 08 | BAIXADA (OFÍCIO) | Encerrada por decisão administrativa |

**Filtro recomendado para prospecção:** situação = "Ativa" (código 02)

---

## KB-013 — Configuração de Chaves Google Cloud

O sistema usa **duas chaves distintas** do Google Cloud:

**Chave 1 — Frontend (Maps JS API)**
- Variável: `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`
- APIs habilitadas: Maps JavaScript API, Places API (New)
- Restrição: HTTP referrers (somente seu domínio: `https://radar.empresa.com.br/*`)
- Propósito: Exibir mapa interativo e autocompletar de endereços no browser

**Chave 2 — Backend (Places API)**
- Variável: `GOOGLE_PLACES_API_KEY`
- APIs habilitadas: Places API (New)
- Restrição: IP addresses (IP da VPS)
- Propósito: Buscar estabelecimentos no servidor (com cache)

**Por que duas chaves?**
- Segurança: Chave de frontend é pública (aparece no código JS) — deve ter restrição por domínio
- Chave de backend fica apenas no servidor — pode ter restrição por IP (mais segura)
- Se uma chave vazar, não compromete a outra

**Onde criar:**
1. Google Cloud Console → console.cloud.google.com
2. Criar projeto "Radar Prospecção"
3. Ativar APIs: Maps JavaScript API, Places API (New), Geocoding API
4. Criar 2 credenciais (API keys) com as restrições acima

**Atenção:** O Google Maps Platform não tem mais crédito universal de $200/mês (removido em 2026). Cada requisição é cobrada. Ver documentação de custos em `docs/infraestrutura-custos.md`.

---

## KB-014 — Glossário Técnico

| Termo | Definição |
|---|---|
| API | Application Programming Interface — protocolo de comunicação entre sistemas |
| BullMQ | Biblioteca de filas para Node.js. O "B" significa Bull; "MQ" = Message Queue |
| Cursor (paginação) | ID do último registro retornado, usado para buscar a próxima página sem perder registros |
| Docker | Plataforma de containers — cada componente do sistema roda isolado |
| HMAC | Hash-based Message Authentication Code — forma de assinar digitalmente dados |
| JWT | JSON Web Token — formato de token para sessões seguras |
| PostGIS | Extensão do PostgreSQL para dados geográficos (coordenadas, polígonos, raios) |
| Prisma | ORM (mapeador objeto-relacional) que gera código TypeScript para acessar o banco |
| Redis | Banco de dados em memória — usado para filas e cache |
| SSE | Server-Sent Events — tecnologia para o servidor enviar atualizações ao browser em tempo real |
| SVIX | Plataforma de webhooks — assina e entrega eventos de terceiros de forma segura |
| VPS | Virtual Private Server — servidor na nuvem |
| Webhook | Chamada HTTP que um serviço externo faz para o seu sistema quando algo acontece |
| Zod | Biblioteca de validação de schemas em TypeScript |
| Argon2 | Algoritmo moderno de hash de senhas (mais seguro que bcrypt) |
| Partition Pruning | Otimização do banco de dados que ignora partições irrelevantes em uma query |
| gzip | Algoritmo de compressão de arquivos — reduz o tamanho do CSV em ~80% |

---

*Knowledge Base — Radar de Prospecção Geográfica · Atualizado em Junho/2026*
