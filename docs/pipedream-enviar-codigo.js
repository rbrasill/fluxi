import { axios } from "@pipedream/platform";

/**
 * Carteiro do login do INCFlow (decisão 50) · STEP "enviar_email" (o passo depois do validar_envio).
 *
 * Mesmo formato do lembrete de tarefas do Atylux: conta Microsoft Outlook conectada no próprio step
 * (botão "Connect", de preferência uma caixa de serviço como nao-responda@…) e envio pelo Graph API.
 *
 * Entrada : `steps.validar_envio.$return_value` = { email, nome, codigo }, já conferidos no step anterior
 *           (segredo do servidor, domínio e formato do código).
 * Saída   : nada além do resumo. Se o envio falhar, o step falha, o workflow não chega ao
 *           `return_response`, o Pipedream devolve erro ao servidor e o servidor apaga o código (502).
 *
 * Segurança do código:
 *   · não registre o código: `$.export` e `console.log` ficam no histórico de execuções;
 *   · `saveToSentItems: "false"`: o e-mail com o código não fica guardado nos Itens Enviados;
 *   · reduza a retenção de dados do workflow ao mínimo (Settings → Data Retention).
 *
 * HTML à prova do Outlook desktop (motor do Word): tudo em tabela, forma no <td> (bgcolor + padding),
 * cores em HEX, sem SVG e sem link. O mesmo HTML está em docs/login-email-codigo.html, para visualizar.
 */

const VERSAO_TEMPLATE = "codigo-v1";

// O nome vem do cadastro de pessoas: escapa antes de virar HTML.
const esc = (s) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function montarHtml(nome, codigo) {
  return `<!-- incflow-login ${VERSAO_TEMPLATE} -->
<html lang="pt" xmlns="http://www.w3.org/1999/xhtml">
<body width="100%" bgcolor="#F0F2F3" style="margin: 0;">
<center style="width: 100%; background: #F0F2F3; text-align: left;">
  <div style="margin: auto; max-width: 600px; padding: 50px 0 30px 0;">
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" width="100%" style="max-width: 600px;">
      <tr>
        <td bgcolor="#f94700" style="background: #f94700; background: linear-gradient(105deg,#f94700 0%,#e0559a 45%,#9f60b7 72%,#40419f 100%); border-radius: 6px 6px 0 0; padding: 28px 35px; text-align: center;">
          <div style="font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 24px; font-weight: 800; letter-spacing: -0.02em; color: #FFFFFF; line-height: 1;">INCFlow</div>
          <div style="font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 13px; font-weight: 600; color: #FFFFFF; margin-top: 7px;">INC Empreendimentos</div>
        </td>
      </tr>
    </table>
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" width="100%" style="border-bottom: 1px solid #D6D6D6; max-width: 600px; table-layout: fixed;">
      <tr>
        <td style="background-color: #FFFFFF; color: #334155; font-family: 'Helvetica Neue', Roboto, Arial, sans-serif; font-size: 15px; line-height: 155%; padding: 34px 35px 30px 35px;">
          <div style="font-size: 16px; color: #0f172a;">Ol&aacute;, ${esc(nome)}!</div>
          <p style="margin: 18px 0 0 0;">Use o c&oacute;digo abaixo para acessar o <strong style="color: #0f172a;">INCFlow</strong>, a plataforma de processos da INC:</p>
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" width="100%" style="margin: 26px 0;">
            <tr>
              <td align="center" bgcolor="#FFF2EC" style="background-color: #FFF2EC; border: 1px solid #FFD9C6; border-radius: 14px; padding: 26px 20px;">
                <div style="font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 11px; font-weight: 700; letter-spacing: 0.18em; text-transform: uppercase; color: #f94700;">Seu c&oacute;digo de acesso</div>
                <div style="font-family: 'Courier New', Consolas, monospace; font-size: 44px; font-weight: 700; letter-spacing: 0.20em; color: #1D2026; margin-top: 12px; line-height: 1;">${esc(codigo)}</div>
              </td>
            </tr>
          </table>
          <p style="margin: 0 0 0 0; font-size: 14px; color: #475569;">
            Este c&oacute;digo &eacute; v&aacute;lido por <b>10 minutos</b> e s&oacute; pode ser usado uma vez.
            Depois de entrar, sua sess&atilde;o dura <b>6 horas</b>.
          </p>
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin: 22px 0 0 0;">
            <tr>
              <td style="border-top: 1px solid #EEF1F7; padding-top: 18px; font-size: 13px; line-height: 150%; color: #64748b;">
                Se voc&ecirc; n&atilde;o tentou acessar o INCFlow, pode ignorar este e-mail com seguran&ccedil;a &mdash; nenhuma a&ccedil;&atilde;o &eacute; necess&aacute;ria.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" width="100%" style="max-width: 600px;">
      <tr>
        <td style="padding: 18px 35px; text-align: center; font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 11px; color: #94a3b8;">
          INCFlow &middot; uma plataforma INC Empreendimentos<br>
          Mensagem autom&aacute;tica &mdash; por favor, n&atilde;o responda.
        </td>
      </tr>
    </table>
  </div>
</center>
</body>
</html>`;
}

export default defineComponent({
  props: {
    microsoft_outlook: {
      type: "app",
      app: "microsoft_outlook",
    },
  },
  async run({ steps, $ }) {
    const { email, nome, codigo } = steps.validar_envio.$return_value;
    await axios($, {
      method: "POST",
      url: "https://graph.microsoft.com/v1.0/me/sendMail",
      headers: {
        Authorization: `Bearer ${this.microsoft_outlook.$auth.oauth_access_token}`,
        "Content-Type": "application/json",
      },
      data: {
        message: {
          subject: "Seu código de acesso ao INCFlow",
          body: { contentType: "HTML", content: montarHtml(nome, codigo) },
          toRecipients: [{ emailAddress: { address: email } }],
        },
        // O código não pode ficar guardado: nada de cópia nos Itens Enviados.
        saveToSentItems: "false",
      },
    });
    // Sem o código e sem o e-mail no resumo: o histórico do Pipedream guarda o que for exportado.
    $.export("$summary", `Código de acesso enviado · template ${VERSAO_TEMPLATE}`);
  },
});
