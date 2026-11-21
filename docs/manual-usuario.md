# Manual do Usuário — Radar de Prospecção Geográfica
## Guia completo para Personal Bankers

> **Versão:** 1.0 · **Data:** Junho/2026 · **Classificação:** Interno

---

## Bem-vindo ao Radar

O Radar de Prospecção Geográfica é a sua ferramenta para **identificar empresas dentro da sua área de cobertura** sem precisar de ajuda da TI ou de listas genéricas.

Com ele, você:
- Define no mapa a região onde quer prospectar
- Filtra as empresas por segmento, porte, regime tributário e muito mais
- Exporta a lista completa em planilha (CSV)
- Dispara e-mails de prospecção diretamente para as empresas

Tudo em minutos, do seu celular ou notebook.

---

## Parte 1 — Primeiro Acesso

### 1.1 Fazendo login

1. Abra o endereço do sistema no seu browser (ex: `https://radar.suabanco.com.br`)
2. Digite seu **e-mail** e **senha** fornecidos pelo gestor
3. Clique em **Entrar**

Se esquecer a senha, entre em contato com o administrador do sistema — não há recuperação automática de senha no momento.

### 1.2 Navegando pelo sistema

O sistema tem quatro telas principais, acessíveis pela barra lateral esquerda:

| Ícone | Tela | Para que serve |
|---|---|---|
| 🗺️ Mapa | Mapa | Ver empresas no mapa e definir área de busca |
| 🏢 CNPJs | Lista de CNPJs | Filtrar e visualizar empresas em tabela |
| 📤 Exportações | Exportações | Ver e baixar arquivos exportados |
| ✉️ Campanhas | Campanhas | Criar e acompanhar campanhas de e-mail |

---

## Parte 2 — Tela Mapa

Esta é a tela mais usada no dia a dia. Comece sempre por aqui.

### 2.1 Definindo sua área de cobertura

**Passo 1 — Buscar a cidade ou endereço:**
No campo de busca no canto superior do mapa, digite o nome de uma cidade ou endereço (ex: "Campinas, SP" ou "Av. Paulista, São Paulo").

Aguarde as sugestões e clique na correta. O mapa centralizará nesse ponto.

**Passo 2 — Ajustar o raio:**
Use o slider de raio (na barra lateral esquerda) para definir a distância de cobertura.

- Raio pequeno (10–30 km): cidades menores ou regiões específicas de uma metrópole
- Raio médio (40–80 km): região metropolitana completa
- Raio grande (100–300 km): prospecção regional (interior de estado)

Um círculo azul aparecerá no mapa indicando a área coberta.

### 2.2 Aplicando filtros no mapa

Com a área definida, use o painel de filtros à esquerda para refinar:

**Filtros mais usados:**

- **Situação:** Selecione "Ativa" para ver apenas empresas em operação (recomendado sempre)
- **CNAE (Ramo de atividade):** Digite os primeiros dígitos do código do segmento que está trabalhando
  - Exemplo: "641" para Bancos; "561" para Restaurantes; "4711" para Supermercados
  - Não sabe o código? Consulte a tabela de CNAEs no Knowledge Base
- **Porte:** ME (microempresa), EPP (pequeno porte), Médio ou Grande
- **Simples Nacional:** Marque "Sim" para focar em empresas do Simples (geralmente mais receptivas a proposta bancária de PJ)
- **MEI:** Marque "Não" se quiser excluir microempreendedores individuais

**Dica:** Comece sempre com filtro de situação "Ativa" — elimina empresas fechadas que poluiriam sua lista.

### 2.3 O que aparece no mapa

**Marcadores de CNPJ (pontos coloridos):**
- Verde: empresa ativa
- Amarelo: empresa com situação irregular ou suspensa
- Vermelho: empresa baixada (aparece apenas se você não filtrou por "Ativa")

Clique num marcador para ver informações básicas (razão social, CNPJ, CNAE).

**Marcadores do Google Places (pontos azuis):**
Mostram estabelecimentos que aparecem no Google Maps — útil para verificar se a empresa realmente existe e está em funcionamento. Atualizado automaticamente a cada 30 dias.

### 2.4 Navegando para a lista de CNPJs

Com os filtros definidos no mapa, clique em **"Ver CNPJs"** ou acesse a tela CNPJs pela barra lateral. Os filtros são preservados automaticamente.

---

## Parte 3 — Tela CNPJs (Lista)

### 3.1 Entendendo a contagem

No topo da tela, você verá algo como:

- **"3.847 empresas encontradas"** → contagem exata
- **"Mais de 10.000 empresas encontradas"** → há muitas empresas; refine os filtros para ver o total exato

**Por que o limite de 10.000?** O sistema trabalha com 66 milhões de empresas. Contar todos de uma vez demoraria muito — o limite mantém a interface rápida.

### 3.2 Usando a barra de filtros

No topo da tela CNPJs há filtros em formato de barra horizontal. Funciona igual ao painel do mapa — os filtros são os mesmos e estão sincronizados.

**Chips de filtro ativos:** Abaixo da barra, aparecem etiquetas (chips) com cada filtro ativo. Para remover um filtro, clique no **×** ao lado dele.

### 3.3 Navegando pela tabela

A tabela mostra até 100 empresas por vez (padrão). Para ver mais:
- Clique em **"Próxima página"** no rodapé da tabela
- A posição é mantida automaticamente (cursor-based — não há bug de "página que pula empresa")

**Colunas disponíveis:** CNPJ, Razão Social, Nome Fantasia, Município, UF, CNAE, Situação, Porte, Simples, MEI, E-mail, Telefone.

### 3.4 Compartilhando uma busca

Copie o endereço da página no browser (URL) e envie para um colega — ele verá exatamente a mesma busca com todos os filtros aplicados.

---

## Parte 4 — Exportação (Download em Planilha)

### 4.1 Iniciando uma exportação

1. Na tela CNPJs (com seus filtros aplicados), clique em **"Exportar CSV"** na barra superior
2. O sistema criará um arquivo com TODOS os resultados (não apenas a página atual)
3. Uma notificação aparecerá confirmando que a exportação foi iniciada

### 4.2 Acompanhando o progresso

A exportação aparecerá automaticamente na tela **Exportações** com uma barra de progresso. Dependendo do volume:
- Até 10.000 registros: geralmente menos de 1 minuto
- 100.000 registros: 3–5 minutos
- 500.000+ registros: pode levar mais tempo

Você não precisa ficar na tela esperando — pode navegar normalmente e voltar depois.

### 4.3 Baixando o arquivo

Quando a barra de progresso atingir 100%, o botão **"Baixar"** ficará disponível. Clique para fazer o download.

**Formato do arquivo:** CSV comprimido (`.csv.gz`). Para abrir:
- **Windows:** Use o WinZip ou 7-Zip para extrair o `.csv`, depois abra no Excel
- **Mac:** Duplo clique extrai automaticamente; abra o `.csv` no Numbers ou Excel

**Validade do link:** O link de download fica disponível por 4 horas após a conclusão. Após isso, re-exporte se necessário (fica salvo no histórico).

### 4.4 Limites e boas práticas

- **Máximo simultâneo:** 5 exportações em andamento ao mesmo tempo
- **Máximo por hora:** 10 exportações por hora
- Se atingir o limite, o sistema mostrará uma mensagem clara e você pode tentar após um tempo

**Dica:** Exporte sempre com filtros refinados em vez de exportar tudo. Uma exportação de "todas as empresas ativas de SP" tem ~3 milhões de linhas — use pelo menos filtro de CNAE ou cidade.

---

## Parte 5 — Campanhas de E-mail

> ⚠️ **Atenção:** O disparo de e-mails está sujeito à validação jurídica/compliance do banco antes do uso em produção. Confirme com seu gestor se esta funcionalidade está liberada para seu uso.

### 5.1 Criando uma campanha

1. Acesse a tela **Campanhas** pela barra lateral
2. Clique em **"Nova Campanha"**
3. Preencha:
   - **Nome:** Identificação interna (ex: "Prospecção SP - Comércio Jan/2027")
   - **Assunto do e-mail:** O que o destinatário verá na caixa de entrada
   - **Corpo do e-mail:** A mensagem principal

### 5.2 Usando variáveis no e-mail

Para personalizar cada e-mail com os dados da empresa, use as variáveis abaixo no assunto e no corpo:

| Variável | O que insere |
|---|---|
| `{{razao_social}}` | Nome oficial da empresa (ex: "PADARIA EXEMPLO LTDA") |
| `{{nome_fantasia}}` | Nome fantasia, se houver (ex: "Padaria do João") |
| `{{cnpj}}` | CNPJ sem formatação (ex: "12345678000190") |
| `{{cnpj_formatado}}` | CNPJ com pontuação (ex: "12.345.678/0001-90") |
| `{{municipio_nome}}` | Nome da cidade (ex: "São Paulo") |
| `{{uf}}` | Estado (ex: "SP") |
| `{{cnae_principal}}` | Código CNAE principal (ex: "4711301") |
| `{{link_descadastro}}` | Link de descadastro (OBRIGATÓRIO em toda campanha) |

**Exemplo de e-mail:**
```
Assunto: Proposta de serviços bancários para {{razao_social}}

Olá!

Gostaria de apresentar nossas soluções bancárias para {{razao_social}},
localizada em {{municipio_nome}}/{{uf}}.

[corpo da mensagem...]

Para não receber mais este tipo de comunicação: {{link_descadastro}}
```

### 5.3 Pré-visualização

Antes de criar a campanha, o sistema mostra como o e-mail ficará com dados reais de exemplo. Verifique se as variáveis estão sendo substituídas corretamente.

### 5.4 Base de destinatários

A campanha usa os mesmos filtros da tela de CNPJs. Apenas empresas com e-mail cadastrado na Receita Federal são incluídas como destinatárias.

O sistema automaticamente **exclui** empresas que:
- Já solicitaram descadastro em campanhas anteriores
- Geraram bounce permanente (e-mail inválido) em campanhas anteriores

### 5.5 Disparando a campanha

1. Revise o sumário (total de destinatários, filtros usados)
2. Leia e confirme o aviso sobre LGPD
3. Clique em **"Confirmar e Enviar"**

O envio é assíncrono — os e-mails são enviados gradualmente em background.

### 5.6 Monitorando resultados

Na tela de campanhas, você verá as métricas de cada campanha:
- **Enviados:** Quantos e-mails saíram com sucesso
- **Abertos:** Quantas empresas abriram o e-mail
- **Clicados:** Quantos clicaram em algum link
- **Respondidos:** Quantos responderam (se configurado)
- **Bounces:** E-mails que não foram entregues

---

## Parte 6 — Dicas e Boas Práticas

### Para bankers em campo

- **Use o Radar antes de ir para uma região** — chegue sabendo quais empresas valem a visita
- **Filtros por CNAE + porte + Simples Nacional** costumam dar a lista mais qualificada
- **Exporte antes de sair do escritório** — o arquivo fica disponível para download por 4 horas

### Para prospecção eficiente

- **Comece pela situação "Ativa"** — economiza tempo sem prospectar empresas fechadas
- **Simples Nacional + MEI = negócios menores** — mais receptivos a conta PJ básica
- **Excluir MEI + Simples Nacional = empresas médias** — mais receptivas a produtos de investimento e capital de giro

### Atalhos úteis

- **URL compartilhável:** Os filtros ficam na URL — copie e envie para um colega replicar a busca
- **Chips de filtro:** Clique no × de qualquer chip para remover um filtro sem perder os outros
- **Histórico de exportações:** Suas últimas exportações ficam salvas — não precisa refazer a busca para baixar novamente

---

## Parte 7 — Perguntas Frequentes (FAQ)

**P: Posso usar o sistema no celular?**
R: Sim. O sistema funciona em qualquer browser mobile (Chrome, Safari). Para melhor experiência no mapa, use o modo paisagem.

**P: Os dados são atualizados com que frequência?**
R: A base de CNPJs da Receita Federal é atualizada mensalmente. O Google Places é atualizado automaticamente a cada 30 dias para cada região consultada.

**P: Por que algumas empresas não têm e-mail ou telefone?**
R: O e-mail e o telefone são informações opcionais na Receita Federal — muitas empresas não informam. O sistema mostra apenas o que está na base oficial.

**P: O que é CNAE?**
R: Classificação Nacional de Atividades Econômicas — um código que identifica o ramo de atividade da empresa. Os primeiros dígitos classificam o setor (ex: 64 = atividades financeiras, 56 = alimentação). Uma tabela completa está disponível no Knowledge Base.

**P: Posso exportar tudo sem filtrar?**
R: Tecnicamente sim, mas não recomendamos. Uma exportação de todo o Brasil tem 66 milhões de linhas — levaria horas e seria impraticável de usar. Use sempre filtros de UF e CNAE pelo menos.

**P: Minha exportação ficou em "falhou". O que fazer?**
R: Aguarde alguns minutos e tente novamente. Se o problema persistir, entre em contato com o suporte informando o horário da exportação e os filtros usados.

**P: Como o sistema decide quais municípios incluir quando defino um raio?**
R: O sistema usa dados geoespaciais reais — calcula os municípios cujos centros geográficos estão dentro do raio definido. Municípios parcialmente dentro do raio (que ficam na borda do círculo) são incluídos.

**P: Posso ter mais de uma exportação ao mesmo tempo?**
R: Sim, até 5 simultaneamente. Se precisar de mais, aguarde alguma concluir.

---

## Parte 8 — Suporte

Para problemas técnicos ou dúvidas não cobertas neste manual, entre em contato:

| Canal | Para quê |
|---|---|
| Gestor regional | Dúvidas sobre filtros, estratégia de prospecção |
| TI / Suporte | Erros no sistema, acesso, exportações com falha |
| Compliance / Jurídico | Dúvidas sobre LGPD e campanhas de e-mail |

Ao contatar o suporte, informe:
- O que estava tentando fazer
- O horário em que ocorreu
- Mensagem de erro exibida (se houver)
- Print da tela (se possível)

---

*Manual do Usuário — Radar de Prospecção Geográfica v2.0 · Uso interno · Junho/2026*
