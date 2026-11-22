/**
 * Template de campanha por RELACIONAMENTO ANTERIOR (e-mail comercial PJ — GR).
 *
 * Para leads em que se conhece o nome do responsável financeiro/sócio e há um
 * relacionamento prévio: o remetente foi responsável pelo cadastro e controle
 * das operações da empresa em um banco onde atuou (ex.: Daycoval). O e-mail é
 * direto, nominal e usa esse histórico como credibilidade — não é indicação
 * nem primeiro contato frio.
 *
 * Mantém o mesmo sistema visual dos demais templates (ver ./defaultTemplate.ts
 * e ./referralTemplate.ts): HTML table-based, estilo inline, sem imagens
 * externas nem emoji. O consumer (email-campaign-consumer) detecta HTML e envia
 * como `html` + alternativa `text`.
 *
 * Variáveis de merge:
 *   Por destinatário: {{razao_social}} {{nome_fantasia}} {{cnpj}} {{cnpj_formatado}}
 *   {{municipio_nome}} {{uf}} {{cnae_principal}} {{responsavel_nome}} {{link_descadastro}}
 *   Nível de campanha: {{banco_relacionamento}} (padrão "Daycoval", editável)
 *
 * {{responsavel_nome}} vem por destinatário (coluna RESPONSAVEL_NOME da planilha).
 * {{banco_relacionamento}} é da campanha (o banco onde houve o relacionamento).
 *
 * Fonte editável (HTML + TXT + README): /campanhas/relacionamento-pj/.
 */

export const RELATIONSHIP_CAMPAIGN_SUBJECT =
  "{{responsavel_nome}}, retomando nosso contato do {{banco_relacionamento}}";

export const RELATIONSHIP_CAMPAIGN_BODY = `<!-- Preheader (texto de preview, oculto) -->
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;height:0;width:0;">
  {{responsavel_nome}}, aqui é o Alexander — cuidei do cadastro e das operações da {{nome_fantasia}} no {{banco_relacionamento}}. Podemos retomar?
  &zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;
</div>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#eef2f4" style="background:#eef2f4;margin:0;padding:28px 12px;font-family:'Segoe UI',Arial,Helvetica,sans-serif;">
  <tr>
    <td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:600px;background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 6px 24px rgba(0,34,47,0.10);">

        <!-- Header / marca -->
        <tr>
          <td bgcolor="#003650" style="background:#003650;padding:26px 36px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="vertical-align:middle;">
                  <span style="color:#ffffff;font-size:26px;font-weight:800;letter-spacing:1px;font-family:'Segoe UI',Arial,sans-serif;">GR</span>
                  <span style="color:#ffffff;font-size:15px;font-weight:600;letter-spacing:.3px;">&nbsp;&nbsp;Gestão Financeira</span>
                </td>
                <td align="right" style="vertical-align:middle;">
                  <span style="color:#33cfc6;font-size:11px;font-weight:700;letter-spacing:2.5px;">FIDC · CRÉDITO · GESTÃO</span>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Faixa de destaque / headline -->
        <tr>
          <td bgcolor="#00222f" style="background:#00222f;padding:34px 36px 32px 36px;">
            <div style="width:44px;height:3px;background:#00b3a9;line-height:3px;font-size:0;margin:0 0 18px 0;">&nbsp;</div>
            <h1 style="color:#ffffff;font-size:24px;line-height:1.3;font-weight:700;margin:0 0 12px 0;">
              Já cuidei das operações da sua empresa. Vamos retomar?
            </h1>
            <p style="color:#a9c4d1;font-size:15px;line-height:1.6;margin:0;">
              Agora à frente da GR, com soluções de crédito e caixa — e a mesma proximidade de antes.
            </p>
          </td>
        </tr>

        <!-- Bloco de relacionamento (credibilidade — o diferencial deste template) -->
        <tr>
          <td style="padding:28px 36px 4px 36px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#eef4fa" style="background:#eef4fa;border:1px solid #c2d8ec;border-left:4px solid #005b6b;border-radius:10px;">
              <tr>
                <td width="56" style="padding:16px 0 16px 18px;vertical-align:middle;">
                  <div style="width:38px;height:38px;background:#005b6b;border-radius:9px;text-align:center;line-height:38px;color:#ffffff;font-size:18px;font-weight:800;">&#9679;</div>
                </td>
                <td style="padding:16px 18px 16px 12px;color:#26414d;font-size:14px;line-height:1.55;vertical-align:middle;">
                  Fui responsável pelo <strong style="color:#00435f;">cadastro e controle das operações</strong> da
                  {{nome_fantasia}} no <strong style="color:#00435f;">Banco {{banco_relacionamento}}</strong>. Conheço a
                  operação de vocês — e é por isso que faço este contato direto.
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Abertura personalizada -->
        <tr>
          <td style="padding:24px 36px 8px 36px;">
            <p style="color:#00222f;font-size:16px;line-height:1.5;margin:0 0 16px 0;">
              Olá, <strong>{{responsavel_nome}}</strong>,
            </p>
            <p style="color:#3f5560;font-size:15px;line-height:1.65;margin:0 0 16px 0;">
              Aqui é o <strong>Alexander Ciarlo</strong>. Quando eu estava no <strong>Banco {{banco_relacionamento}}</strong>,
              fui responsável pelo cadastro e pelo controle das operações da <strong>{{nome_fantasia}}</strong> —
              então já conheço de perto a rotina financeira de vocês.
            </p>
            <p style="color:#3f5560;font-size:15px;line-height:1.65;margin:0 0 8px 0;">
              Hoje atuo na GR Gestão Financeira, e é justamente pela sua operação que retomo o contato.
              Costumamos destravar, com condições melhores que o balcão de banco, situações como estas:
            </p>
          </td>
        </tr>

        <!-- Dores que resolvemos (tiles on-brand) -->
        <tr>
          <td style="padding:8px 36px 4px 36px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#f4f8f9" style="background:#f4f8f9;border-radius:10px;border:1px solid #e2eaed;">
              <tr>
                <td width="64" style="padding:16px 0 16px 18px;vertical-align:middle;">
                  <div style="width:38px;height:38px;background:#00b3a9;border-radius:9px;text-align:center;line-height:38px;color:#ffffff;font-size:19px;font-weight:800;">&ne;</div>
                </td>
                <td style="padding:16px 18px 16px 14px;border-bottom:1px solid #e8eef0;color:#25404b;font-size:14px;line-height:1.5;vertical-align:middle;">
                  <strong style="color:#00435f;">Fluxo de caixa descasado</strong> — recebimentos e pagamentos que não fecham no mês.
                </td>
              </tr>
              <tr>
                <td width="64" style="padding:16px 0 16px 18px;vertical-align:middle;">
                  <div style="width:38px;height:38px;background:#00b3a9;border-radius:9px;text-align:center;line-height:38px;color:#ffffff;font-size:19px;font-weight:800;">&#8635;</div>
                </td>
                <td style="padding:16px 18px 16px 14px;border-bottom:1px solid #e8eef0;color:#25404b;font-size:14px;line-height:1.5;vertical-align:middle;">
                  <strong style="color:#00435f;">Capital de giro</strong> — para comprar matéria-prima e manter a operação girando.
                </td>
              </tr>
              <tr>
                <td width="64" style="padding:16px 0 16px 18px;vertical-align:middle;">
                  <div style="width:38px;height:38px;background:#00b3a9;border-radius:9px;text-align:center;line-height:38px;color:#ffffff;font-size:19px;font-weight:800;">&rarr;</div>
                </td>
                <td style="padding:16px 18px 16px 14px;color:#25404b;font-size:14px;line-height:1.5;vertical-align:middle;">
                  <strong style="color:#00435f;">Prazos com fornecedores</strong> — negociação estendida via operações de risco sacado.
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Diferenciais -->
        <tr>
          <td style="padding:28px 36px 4px 36px;">
            <p style="color:#00222f;font-size:13px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;margin:0 0 14px 0;">
              Por que a GR
            </p>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td width="28" style="vertical-align:top;padding:7px 0;">
                  <div style="width:18px;height:18px;background:#e4f6f4;border-radius:5px;text-align:center;line-height:18px;color:#008f87;font-size:13px;font-weight:800;">&#10003;</div>
                </td>
                <td style="padding:6px 0;color:#25404b;font-size:15px;line-height:1.55;">
                  <strong style="color:#00222f;">Antecipação de recebíveis via FIDC</strong> — nosso carro-chefe: caixa imediato com taxas competitivas frente ao mercado.
                </td>
              </tr>
              <tr>
                <td width="28" style="vertical-align:top;padding:7px 0;">
                  <div style="width:18px;height:18px;background:#e4f6f4;border-radius:5px;text-align:center;line-height:18px;color:#008f87;font-size:13px;font-weight:800;">&#10003;</div>
                </td>
                <td style="padding:6px 0;color:#25404b;font-size:15px;line-height:1.55;">
                  <strong style="color:#00222f;">Sem IOF e fora do Sisbacen</strong> — redução real de custo na operação de crédito.
                </td>
              </tr>
              <tr>
                <td width="28" style="vertical-align:top;padding:7px 0;">
                  <div style="width:18px;height:18px;background:#e4f6f4;border-radius:5px;text-align:center;line-height:18px;color:#008f87;font-size:13px;font-weight:800;">&#10003;</div>
                </td>
                <td style="padding:6px 0;color:#25404b;font-size:15px;line-height:1.55;">
                  <strong style="color:#00222f;">Operações sob medida</strong> — cessão com/sem regresso, capital de giro para produção, serviços de trustee e consultoria financeira.
                </td>
              </tr>
              <tr>
                <td width="28" style="vertical-align:top;padding:7px 0;">
                  <div style="width:18px;height:18px;background:#e4f6f4;border-radius:5px;text-align:center;line-height:18px;color:#008f87;font-size:13px;font-weight:800;">&#10003;</div>
                </td>
                <td style="padding:6px 0;color:#25404b;font-size:15px;line-height:1.55;">
                  <strong style="color:#00222f;">Atendimento consultivo e próximo</strong> — a mesma proximidade de quando cuidávamos das suas operações no {{banco_relacionamento}}.
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Bloco CTA (botão bulletproof) -->
        <tr>
          <td style="padding:28px 36px 8px 36px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#f4f8f9" style="background:#f4f8f9;border:1px solid #d8e6e9;border-radius:12px;">
              <tr>
                <td align="center" style="padding:26px 24px;">
                  <p style="color:#00222f;font-size:17px;font-weight:700;line-height:1.4;margin:0 0 6px 0;">
                    {{responsavel_nome}}, topa uma conversa rápida?
                  </p>
                  <p style="color:#5a7280;font-size:14px;line-height:1.5;margin:0 0 20px 0;">
                    15 minutos para eu entender o momento da {{nome_fantasia}} e trazer um
                    <strong>diagnóstico consultivo gratuito</strong> do caixa e dos recebíveis. Sem compromisso.
                  </p>
                  <!--[if mso]>
                  <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="https://radar.grgestaofinanceira.com.br/agende" style="height:50px;v-text-anchor:middle;width:230px;" arcsize="16%" strokecolor="#00b3a9" fillcolor="#00b3a9">
                    <w:anchorlock/>
                    <center style="color:#ffffff;font-family:sans-serif;font-size:16px;font-weight:bold;">Agendar conversa &rarr;</center>
                  </v:roundrect>
                  <![endif]-->
                  <!--[if !mso]><!-- -->
                  <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto;">
                    <tr>
                      <td align="center" bgcolor="#00b3a9" style="background:#00b3a9;border-radius:8px;box-shadow:0 3px 8px rgba(0,143,135,0.30);">
                        <a href="https://radar.grgestaofinanceira.com.br/agende" style="display:inline-block;padding:15px 40px;color:#ffffff;font-size:16px;font-weight:700;text-decoration:none;">
                          Agendar conversa&nbsp;&rarr;
                        </a>
                      </td>
                    </tr>
                  </table>
                  <!--<![endif]-->
                  <p style="color:#667f8b;font-size:13px;line-height:1.6;margin:18px 0 0 0;">
                    Prefere algo mais rápido? Fale no
                    <a href="https://wa.me/5516988037000?text=Ol%C3%A1%20Alexander%2C%20aqui%20%C3%A9%20da%20{{nome_fantasia}}" style="color:#008f87;font-weight:700;text-decoration:none;">WhatsApp</a>
                    &nbsp;·&nbsp; ou conheça as soluções no
                    <a href="https://www.grgestaofinanceira.com.br" style="color:#008f87;font-weight:700;text-decoration:none;">nosso site</a>.
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- P.S. -->
        <tr>
          <td style="padding:18px 36px 4px 36px;">
            <p style="color:#3f5560;font-size:14px;line-height:1.6;margin:0;">
              <strong style="color:#008f87;">P.S.</strong> — Se preferir, é só responder este e-mail que eu retomo
              daqui, {{responsavel_nome}}. Foi bom trabalhar com a {{nome_fantasia}} no {{banco_relacionamento}};
              acredito que agora posso ajudar ainda mais.
            </p>
          </td>
        </tr>

        <!-- Faixa de segmentos -->
        <tr>
          <td style="padding:20px 36px 4px 36px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #e6ebee;">
              <tr>
                <td style="padding-top:16px;color:#8299a3;font-size:12px;letter-spacing:1px;text-transform:uppercase;text-align:center;">
                  Atuação&nbsp;&nbsp;·&nbsp;&nbsp;<span style="color:#00877f;font-weight:700;">Agronegócio</span> &nbsp;·&nbsp; <span style="color:#00877f;font-weight:700;">Indústria</span> &nbsp;·&nbsp; <span style="color:#00877f;font-weight:700;">Comércio</span> &nbsp;·&nbsp; <span style="color:#00877f;font-weight:700;">Serviços</span>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Assinatura -->
        <tr>
          <td style="padding:22px 36px 26px 36px;">
            <table role="presentation" cellpadding="0" cellspacing="0">
              <tr>
                <td width="52" style="vertical-align:middle;">
                  <div style="width:46px;height:46px;line-height:46px;text-align:center;border-radius:50%;background:#003650;color:#ffffff;font-size:16px;font-weight:800;">AC</div>
                </td>
                <td style="vertical-align:middle;padding-left:14px;">
                  <div style="color:#00222f;font-size:15px;font-weight:700;">Alexander Ciarlo</div>
                  <div style="color:#667f8b;font-size:13px;">Gestor Financeiro · GR Gestão Financeira</div>
                </td>
              </tr>
            </table>
            <table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:14px;">
              <tr>
                <td style="padding:3px 0;color:#00877f;font-size:11px;font-weight:700;letter-spacing:1px;width:56px;vertical-align:middle;">TEL</td>
                <td style="padding:3px 0;color:#3f5560;font-size:13px;vertical-align:middle;">(16) 9 8803-7000</td>
              </tr>
              <tr>
                <td style="padding:3px 0;color:#00877f;font-size:11px;font-weight:700;letter-spacing:1px;vertical-align:middle;">E-MAIL</td>
                <td style="padding:3px 0;color:#3f5560;font-size:13px;vertical-align:middle;">administrativo@grgestaofinanceira.com.br</td>
              </tr>
              <tr>
                <td style="padding:3px 0;color:#00877f;font-size:11px;font-weight:700;letter-spacing:1px;vertical-align:middle;">SITE</td>
                <td style="padding:3px 0;color:#3f5560;font-size:13px;vertical-align:middle;">www.grgestaofinanceira.com.br</td>
              </tr>
              <tr>
                <td style="padding:3px 0;color:#00877f;font-size:11px;font-weight:700;letter-spacing:1px;vertical-align:top;">LOCAL</td>
                <td style="padding:3px 0;color:#3f5560;font-size:13px;line-height:1.5;">Rua São Pio X, 343 — Sala 21, Vila Prado — São Carlos/SP</td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Footer / LGPD -->
        <tr>
          <td bgcolor="#003650" style="background:#003650;padding:20px 36px;">
            <p style="color:#8fb2c2;font-size:11px;line-height:1.65;margin:0;">
              Você recebeu este e-mail porque tivemos um relacionamento profissional anterior (cadastro e
              controle das operações da {{nome_fantasia}} no Banco {{banco_relacionamento}}). Respeitamos a
              LGPD: se não deseja mais receber nossos contatos,
              <a href="{{link_descadastro}}" style="color:#33cfc6;text-decoration:underline;">descadastre-se aqui</a>.
            </p>
          </td>
        </tr>

      </table>

      <!-- rodapé fora do card -->
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:600px;">
        <tr>
          <td align="center" style="padding:16px 36px;color:#9fb0b8;font-size:11px;line-height:1.5;">
            GR Gestão Financeira · São Carlos/SP · FIDC · Crédito · Gestão
          </td>
        </tr>
      </table>

    </td>
  </tr>
</table>`;
