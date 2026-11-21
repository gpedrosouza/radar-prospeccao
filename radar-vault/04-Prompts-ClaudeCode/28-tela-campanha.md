# Prompt 28 — Tela de Campanhas de E-mail

> Fase: 5 — E-mail
> Pré-requisito: `27-webhook-bounce-unsubscribe.md` concluído
> Último prompt do plano — conclui o MVP completo

---

## Prompt

```
Leia o CLAUDE.md na raiz do projeto. Consulte também docs/design/radar-gr-ui.html (tela "04
Campanhas") para a estrutura exata do formulário e painel de estatísticas — replique cores,
o aviso fixo de LGPD, e os mini-cards de taxa de abertura/clique/resposta usando as variáveis
CSS do arquivo. Note que o blueprint já usa a copy "GR Assessoria Financeira" como remetente
de exemplo — mantenha essa referência de marca no template padrão sugerido na UI.

Último componente de UI: a tela de Campanhas (app/(app)/campanhas/page.tsx), seguindo o
mesmo padrão visual já estabelecido (dark theme, paleta definida no prompt 16).

Layout: formulário de nova campanha à esquerda (largura fixa ~700px) + painel de campanhas
anteriores/estatísticas à direita.

Formulário (à esquerda):
1. Campo "Nome da Campanha"
2. Select "Base de Destinatários" — lista exportações/buscas recentes do usuário (reusa o
   histórico de CnpjExportJob ou um seletor direto de filtros), mostrando contagem total e
   quantos têm e-mail válido (ex: "1.847 com e-mail válido (57% de cobertura)")
3. Campo "Assunto do E-mail"
4. Textarea "Corpo do E-mail" com suporte às variáveis (mostre uma lista de chips clicáveis
   abaixo: {{razao_social}}, {{cnae_descricao}}, {{municipio}}, {{porte}}, {{nome_banker}} —
   clicar insere a variável na posição do cursor da textarea)
5. Configuração de envio: select de "Agendamento" (Imediato, por agora não precisa de
   agendamento futuro real, pode ser só "Imediato" funcional) e exibição do delay configurado
6. Card de aviso fixo sobre LGPD: "⚠ Atenção LGPD — Confirme conformidade legal antes do
   disparo. E-mails da Receita foram fornecidos para fins cadastrais, não para marketing
   direto." (cor de warning, sempre visível, não dismissable)
7. Botões: "✉ Disparar Campanha" (primário, com confirmação modal antes de disparar de fato —
   mostre um resumo: "Você está prestes a enviar para X destinatários, isso não pode ser
   desfeito") e "Pré-visualizar" (mostra o e-mail renderizado com dados de exemplo) e "Salvar
   rascunho"

Painel direito (campanhas anteriores):
- Lista de campanhas já enviadas (busca via GET /api/campaigns), cada card mostrando:
  nome, data, total enviados, e três mini-métricas: Taxa de Abertura, Taxa de Clique, Taxa de
  Resposta (calculadas a partir dos EmailRecipient.status)
- Um card de "Configuração de Envio Atual" mostrando o delay configurado, provider (Resend),
  status de SPF/DKIM/DMARC (pode ser um indicador estático por agora, ou — se quiser ir além —
  uma chamada que verifica os registros DNS reais do domínio)

Ao clicar em "Disparar Campanha" (após confirmar no modal):
1. Chama POST /api/campaigns (cria a campanha em rascunho com os dados do formulário)
2. Chama POST /api/campaigns/[id]/send (dispara o envio real, conforme implementado no
   prompt 26)
3. Mostra feedback de sucesso e redireciona para visualizar o progresso da campanha (pode
   reusar o padrão de SSE já estabelecido para exportações, criando um stream equivalente
   para campanhas se fizer sentido, ou um polling simples já que envio de e-mail é mais lento
   e tolerante a latência de atualização que exportação de CSV)

Ao final desta tela, faça uma revisão geral: rode o fluxo completo do produto ponta a ponta
(login → mapa → filtro → exportação → campanha) e me reporte qualquer inconsistência visual
ou funcional entre as telas que você notar.

Depois, atualize o CLAUDE.md da raiz: a seção "Fase atual" deve dizer "MVP completo — todas as
fases do plano inicial implementadas. Próximos passos: ver roadmap pós-MVP no vault Obsidian."
```

## Após rodar este prompt
- **Isso conclui o plano completo do MVP.** Atualize [[03-Fases-Desenvolvimento/Status-Atual]] marcando todas as fases
- Faça um teste de aceitação completo seguindo a jornada de [[00-Visao/Personas-e-Jornada]]
- Considere registrar um ADR final resumindo o que mudou do plano original durante a implementação (decisões reais que o Claude Code tomou e você aceitou ao longo do caminho)
