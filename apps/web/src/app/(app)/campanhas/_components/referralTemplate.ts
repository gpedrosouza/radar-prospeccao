/**
 * Template de campanha por INDICAÇÃO (e-mail comercial PJ — GR Gestão Financeira).
 *
 * Variante do template padrão para leads que são indicações de clientes já
 * fidelizados (fornecedores ou clientes desse cliente). O e-mail referencia o
 * contato em comum — nome e empresa — logo na abertura, para dar credibilidade
 * e "quebrar o gelo" de um primeiro contato.
 *
 * Mantém o mesmo sistema visual do template padrão (ver ./defaultTemplate.ts):
 * corpo HTML table-based, estilo inline, sem imagens externas nem emoji; ícones
 * são tiles CSS on-brand com glifos não-emoji. O consumer da fila
 * (email-campaign-consumer) detecta HTML e envia como `html` + alternativa `text`.
 *
 * Variáveis de merge suportadas: {{razao_social}} {{nome_fantasia}} {{cnpj}}
 * {{cnpj_formatado}} {{municipio_nome}} {{uf}} {{cnae_principal}}
 * {{indicado_por_nome}} {{indicado_por_empresa}} {{link_descadastro}}
 *
 * {{indicado_por_nome}} e {{indicado_por_empresa}} são preenchidos no formulário
 * de criação da campanha (nível de campanha — uma indicação por lote) e injetados
 * em cada destinatário no envio.
 *
 * Fonte editável (versão HTML + TXT + README): /campanhas/indicacao-pj/.
 */

export const REFERRAL_CAMPAIGN_SUBJECT =
  "{{nome_fantasia}}, {{indicado_por_nome}} da {{indicado_por_empresa}} sugeriu falarmos";

export const REFERRAL_CAMPAIGN_BODY = `<!-- Preheader (texto de preview, oculto) -->
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;height:0;width:0;">
  {{indicado_por_nome}}, da {{indicado_por_empresa}}, comentou que a GR poderia ajudar a {{nome_fantasia}} com caixa e crédito. Vamos conversar?
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
              Chegamos até você por uma boa indicação.
            </h1>
            <p style="color:#a9c4d1;font-size:15px;line-height:1.6;margin:0;">
              Crédito estruturado sob medida, com atendimento consultivo — e a confiança de quem já trabalha conosco.
            </p>
          </td>
        </tr>

        <!-- Bloco de indicação (credibilidade — o diferencial deste template) -->
        <tr>
          <td style="padding:28px 36px 4px 36px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#eefaf8" style="background:#eefaf8;border:1px solid #b9e7e2;border-left:4px solid #00b3a9;border-radius:10px;">
              <tr>
                <td width="56" style="padding:16px 0 16px 18px;vertical-align:middle;">
                  <div style="width:38px;height:38px;background:#00b3a9;border-radius:50%;text-align:center;line-height:38px;color:#ffffff;font-size:19px;font-weight:800;">&#9733;</div>
                </td>
                <td style="padding:16px 18px 16px 12px;color:#1f4a44;font-size:14px;line-height:1.55;vertical-align:middle;">
                  Indicação de <strong style="color:#006b64;">{{indicado_por_nome}}</strong>, da
                  <strong style="color:#006b64;">{{indicado_por_empresa}}</strong> — que já é cliente da GR e
                  sugeriu que nossas soluções poderiam fazer sentido para a {{nome_fantasia}}.
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Abertura personalizada -->
        <tr>
          <td style="padding:24px 36px 8px 36px;">
            <p style="color:#00222f;font-size:16px;line-height:1.5;margin:0 0 16px 0;">
              Olá, time da <strong>{{nome_fantasia}}</strong>,
            </p>
            <p style="color:#3f5560;font-size:15px;line-height:1.65;margin:0 0 16px 0;">
              Meu nome é <strong>Alexander Ciarlo</strong>, gestor financeiro da GR Gestão Financeira.
              Chego até vocês por indicação de <strong>{{indicado_por_nome}}</strong>, da
              <strong>{{indicado_por_empresa}}</strong>, com quem já temos uma parceria de confiança.
              Ao conhecer a rotina da {{indicado_por_empresa}}, comentamos sobre desafios de caixa e
              crédito comuns em {{municipio_nome}}/{{uf}} — e o nome da {{nome_fantasia}} surgiu naturalmente.
            </p>
            <p style="color:#3f5560;font-size:15px;line-height:1.65;margin:0 0 8px 0;">
              Antes de qualquer proposta, olhamos para a realidade da operação. Costumamos
              destravar situações como estas:
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
                  <strong style="color:#00222f;">Atendimento consultivo e próximo</strong> — a mesma proximidade que fez a {{indicado_por_empresa}} confiar na gente.
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Como funciona (4 passos) -->
        <tr>
          <td style="padding:26px 36px 6px 36px;">
            <p style="color:#00222f;font-size:13px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;margin:0 0 16px 0;">
              Como funciona
            </p>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td width="25%" align="center" style="vertical-align:top;padding:0 6px;">
                  <div style="width:36px;height:36px;line-height:36px;border-radius:50%;background:#003650;color:#ffffff;font-size:14px;font-weight:800;margin:0 auto 8px auto;">1</div>
                  <div style="color:#3f5560;font-size:12px;line-height:1.4;">Conversa de apresentação</div>
                </td>
                <td width="25%" align="center" style="vertical-align:top;padding:0 6px;">
                  <div style="width:36px;height:36px;line-height:36px;border-radius:50%;background:#005b6b;color:#ffffff;font-size:14px;font-weight:800;margin:0 auto 8px auto;">2</div>
                  <div style="color:#3f5560;font-size:12px;line-height:1.4;">Diagnóstico consultivo</div>
                </td>
                <td width="25%" align="center" style="vertical-align:top;padding:0 6px;">
                  <div style="width:36px;height:36px;line-height:36px;border-radius:50%;background:#00877f;color:#ffffff;font-size:14px;font-weight:800;margin:0 auto 8px auto;">3</div>
                  <div style="color:#3f5560;font-size:12px;line-height:1.4;">Estruturação sob medida</div>
                </td>
                <td width="25%" align="center" style="vertical-align:top;padding:0 6px;">
                  <div style="width:36px;height:36px;line-height:36px;border-radius:50%;background:#00b3a9;color:#ffffff;font-size:14px;font-weight:800;margin:0 auto 8px auto;">4</div>
                  <div style="color:#3f5560;font-size:12px;line-height:1.4;">Acompanhamento contínuo</div>
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
                    Topa uma conversa de 15 minutos?
                  </p>
                  <p style="color:#5a7280;font-size:14px;line-height:1.5;margin:0 0 20px 0;">
                    Pela indicação da {{indicado_por_empresa}}, oferecemos um
                    <strong>diagnóstico consultivo gratuito</strong> do seu fluxo de caixa e recebíveis. Sem compromisso.
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
                    <a href="https://wa.me/5516988037000?text=Ol%C3%A1%2C%20vim%20por%20indica%C3%A7%C3%A3o%20da%20{{indicado_por_empresa}}" style="color:#008f87;font-weight:700;text-decoration:none;">WhatsApp</a>
                    &nbsp;·&nbsp; ou conheça as soluções no
                    <a href="https://www.grgestaofinanceira.com.br" style="color:#008f87;font-weight:700;text-decoration:none;">nosso site</a>.
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- P.S. (incentiva resposta = bom p/ reputação) -->
        <tr>
          <td style="padding:18px 36px 4px 36px;">
            <p style="color:#3f5560;font-size:14px;line-height:1.6;margin:0;">
              <strong style="color:#008f87;">P.S.</strong> — Se quiser, confirme com {{indicado_por_nome}}, da
              {{indicado_por_empresa}}, como tem sido trabalhar com a gente. E mesmo que crédito não seja
              prioridade agora, um diagnóstico do seu fluxo de caixa costuma revelar oportunidades — é só
              responder este e-mail ou escrever para
              <a href="mailto:administrativo@grgestaofinanceira.com.br" style="color:#008f87;font-weight:700;text-decoration:none;">administrativo@grgestaofinanceira.com.br</a>.
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
              Você recebeu este e-mail porque {{indicado_por_nome}}, da {{indicado_por_empresa}}, indicou
              a {{nome_fantasia}} como empresa que poderia se beneficiar das nossas soluções. Respeitamos a
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
