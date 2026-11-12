import { axios } from "@pipedream/platform";

/**
 * Carteiro dos convites para entrevista com a Maia (decisão 53) · STEP "enviar_convite" (depois do validar_convite).
 *
 * Mesmo formato do envio do código de login e do lembrete de tarefas do Atylux: conta Microsoft Outlook
 * conectada no próprio step (botão "Connect", de preferência uma caixa de serviço como nao-responda@…) e
 * envio pelo Graph API.
 *
 * Entrada : `steps.validar_convite.$return_value` = { email, nome, processo, convidado_por, nota, link, finalidade }, já conferidos.
 *           `finalidade` (decisão 89) escolhe o texto: "processo" (a conversa é sobre como o processo funciona) ou
 *           "regras" (a conversa é sobre as regras de negócio: o que pode, o que não pode e em que condições).
 * Saída   : nada além do resumo. Se o envio falhar, o step falha, o workflow não chega ao `return_response`,
 *           o Pipedream devolve erro ao servidor e o INCFlow marca o convite como "sem e-mail" (dá para reenviar).
 *
 * Segurança: não registre o link nem o e-mail ($.export e console.log ficam no histórico); saveToSentItems "false";
 * reduza a retenção de dados do workflow ao mínimo (Settings → Data Retention).
 *
 * HTML à prova do Outlook desktop (motor do Word): tabelas, forma no <td> (bgcolor + padding), cores em HEX, sem
 * SVG. O botão leva ao app (o validar_convite só aceita links para o host do app). O mesmo HTML está em
 * docs/convite-email.html, para visualizar.
 */

const VERSAO_TEMPLATE = "convite-v2";

// Os textos que mudam com a finalidade da entrevista (decisão 89). Já em HTML (com as entidades).
const TEXTOS = {
  processo: {
    assunto: (processo) => `Convite: entrevista com a Maia sobre ${processo}`,
    convite: "sobre o processo:",
    rotulo: "Processo",
    como: "&Eacute; uma liga&ccedil;&atilde;o por voz, no seu tempo: a Maia pergunta como o processo funciona e voc&ecirc; responde falando, como numa conversa.",
    gravada: "A conversa &eacute; gravada e processada por servi&ccedil;os de IA para gerar a descri&ccedil;&atilde;o do processo.",
  },
  regras: {
    assunto: (processo) => `Convite: conversa com a Maia sobre as regras de negócio de ${processo}`,
    convite: "sobre as <strong style=\"color: #0f172a;\">regras de neg&oacute;cio</strong> do processo:",
    rotulo: "Regras de neg&oacute;cio do processo",
    como: "&Eacute; uma liga&ccedil;&atilde;o por voz, no seu tempo. O objetivo n&atilde;o &eacute; mapear o passo a passo do processo: &eacute; entender e documentar as regras que valem nele, ou seja, o que pode, o que n&atilde;o pode, os limites, os prazos e em que condi&ccedil;&otilde;es. A Maia pergunta, pede exemplos de casos reais e repete cada regra para voc&ecirc; confirmar.",
    gravada: "A conversa &eacute; gravada e processada por servi&ccedil;os de IA para separar as regras de neg&oacute;cio. Nenhuma regra passa a valer sozinha: elas ficam &agrave; espera da confirma&ccedil;&atilde;o de quem cuida do processo.",
  },
};

// Nome, processo, quem convidou e a nota vêm do cadastro: escapa antes de virar HTML.
const esc = (s) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const FONTE = "font-family: 'Helvetica Neue', Arial, sans-serif;";

function montarHtml({ nome, processo, convidado_por, nota, link, finalidade }) {
  const url = esc(link);
  const t = TEXTOS[finalidade] || TEXTOS.processo;
  return `<!-- incflow-convite ${VERSAO_TEMPLATE} -->
<html lang="pt" xmlns="http://www.w3.org/1999/xhtml">
<body width="100%" bgcolor="#F0F2F3" style="margin: 0;">
<center style="width: 100%; background: #F0F2F3; text-align: left;">
  <div style="margin: auto; max-width: 600px; padding: 50px 0 30px 0;">
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" width="100%" style="max-width: 600px;">
      <tr>
        <td bgcolor="#f94700" style="background: #f94700; background: linear-gradient(105deg,#f94700 0%,#e0559a 45%,#9f60b7 72%,#40419f 100%); border-radius: 6px 6px 0 0; padding: 28px 35px; text-align: center;">
          <div style="${FONTE} font-size: 24px; font-weight: 800; letter-spacing: -0.02em; color: #FFFFFF; line-height: 1;">INCFlow</div>
          <div style="${FONTE} font-size: 13px; font-weight: 600; color: #FFFFFF; margin-top: 7px;">INC Empreendimentos</div>
        </td>
      </tr>
    </table>
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" width="100%" style="border-bottom: 1px solid #D6D6D6; max-width: 600px; table-layout: fixed;">
      <tr>
        <td style="background-color: #FFFFFF; color: #334155; font-family: 'Helvetica Neue', Roboto, Arial, sans-serif; font-size: 15px; line-height: 155%; padding: 34px 35px 30px 35px;">
          <div style="font-size: 16px; color: #0f172a;">Ol&aacute;, ${esc(nome)}!</div>
          <p style="margin: 18px 0 0 0;"><strong style="color: #0f172a;">${esc(convidado_por)}</strong> convidou voc&ecirc; para uma conversa com a <strong style="color: #0f172a;">Maia</strong>, a entrevistadora por voz do INCFlow, ${t.convite}</p>
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" width="100%" style="margin: 22px 0;">
            <tr>
              <td align="center" bgcolor="#FFF2EC" style="background-color: #FFF2EC; border: 1px solid #FFD9C6; border-radius: 14px; padding: 22px 20px;">
                <div style="${FONTE} font-size: 11px; font-weight: 700; letter-spacing: 0.18em; text-transform: uppercase; color: #f94700;">${t.rotulo}</div>
                <div style="${FONTE} font-size: 22px; font-weight: 700; color: #1D2026; margin-top: 8px; line-height: 1.25;">${esc(processo)}</div>
              </td>
            </tr>
          </table>
          <p style="margin: 0 0 14px 0; font-size: 14px; color: #475569;">
            ${t.como}
            Costuma levar de 15 a 30 minutos. Use fones de ouvido se puder e, se precisar sair no meio, &eacute; s&oacute; dizer: ela pausa e voc&ecirc;s continuam depois.
          </p>
${nota ? `          <p style="margin: 0 0 14px 0; font-size: 14px; color: #475569;">O que ${esc(convidado_por)} pediu para a Maia focar: <em>&ldquo;${esc(nota)}&rdquo;</em></p>\n` : ""}
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" style="margin: 24px auto 10px auto;">
            <tr>
              <td align="center" bgcolor="#0f5c63" style="background-color: #0f5c63; border-radius: 10px;">
                <a href="${url}" target="_blank" style="display: inline-block; padding: 14px 28px; ${FONTE} font-size: 15px; font-weight: 700; color: #FFFFFF; text-decoration: none;">Abrir a entrevista</a>
              </td>
            </tr>
          </table>
          <p style="margin: 10px 0 0 0; font-size: 13px; line-height: 150%; color: #64748b; text-align: center;">
            Para entrar, use seu e-mail corporativo: voc&ecirc; recebe um c&oacute;digo de 6 d&iacute;gitos.<br>
            Se o bot&atilde;o n&atilde;o abrir, copie este endere&ccedil;o: <span style="color: #0f5c63; word-break: break-all;">${url}</span>
          </p>
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin: 22px 0 0 0;">
            <tr>
              <td style="border-top: 1px solid #EEF1F7; padding-top: 18px; font-size: 13px; line-height: 150%; color: #64748b;">
                ${t.gravada} Se n&atilde;o esperava este convite, fale com quem convidou.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" width="100%" style="max-width: 600px;">
      <tr>
        <td style="padding: 18px 35px; text-align: center; ${FONTE} font-size: 11px; color: #94a3b8;">
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
    const d = steps.validar_convite.$return_value;
    await axios($, {
      method: "POST",
      url: "https://graph.microsoft.com/v1.0/me/sendMail",
      headers: {
        Authorization: `Bearer ${this.microsoft_outlook.$auth.oauth_access_token}`,
        "Content-Type": "application/json",
      },
      data: {
        message: {
          subject: (TEXTOS[d.finalidade] || TEXTOS.processo).assunto(d.processo),
          body: { contentType: "HTML", content: montarHtml(d) },
          toRecipients: [{ emailAddress: { address: d.email } }],
        },
        saveToSentItems: "false",
      },
    });
    // Sem o link e sem o e-mail no resumo: o histórico do Pipedream guarda o que for exportado.
    $.export("$summary", `Convite enviado · template ${VERSAO_TEMPLATE}`);
  },
});
