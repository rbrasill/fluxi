import crypto from "node:crypto";

/**
 * Carteiro dos convites para entrevista com a Maia (decisão 53) · STEP "validar_convite" (o passo depois do trigger).
 *
 * Workflow próprio, separado do de login (docs/login.md): tem o seu segredo (CONVITE_MAILER_SECRET, em
 * Project → Variables, marcada como Secret) e só entrega convites.
 *
 * Entrada : o POST do servidor do INCFlow, com o cabeçalho x-inc-secret e o corpo
 *           { tipo: "convite", email, nome, processo, convidado_por, nota, link, finalidade }.
 *           `finalidade` (decisão 89): "processo" (mapear o processo) ou "regras" (levantar as regras de negócio);
 *           sem o campo, ou com outro valor, vale "processo".
 * Saída   : { email, nome, processo, convidado_por, nota, link, finalidade } para o step `enviar_convite`,
 *           ou a recusa (401 segredo inválido; 400 dados fora do esperado), sem enviar nada.
 *
 * O link só pode apontar para o próprio app (https, host em HOSTS_DO_APP, caminho /app/entrevistas/…):
 * este workflow nunca vira um encaminhador de links.
 */

const DOMINIO = "@meuinc.com.br";
const HOSTS_DO_APP = ["incflow.vercel.app"];

export default defineComponent({
  async run({ steps, $ }) {
    const recusar = async (status, motivo) => {
      await $.respond({ status, body: { ok: false } });
      return $.flow.exit(motivo); // encerra sem enviar; o motivo fica só no log do Pipedream
    };
    const esperado = process.env.CONVITE_MAILER_SECRET || "";
    const recebido = String(steps.trigger.event.headers?.["x-inc-secret"] || "");
    const a = Buffer.from(recebido), b = Buffer.from(esperado);
    if (!esperado || a.length !== b.length || !crypto.timingSafeEqual(a, b)) return recusar(401, "Segredo inválido.");

    const corpo = steps.trigger.event.body || {};
    if (corpo.tipo && corpo.tipo !== "convite") return recusar(400, "Este workflow só entrega convites.");
    const email = String(corpo.email || "").trim().toLowerCase();
    const nome = String(corpo.nome || "").trim() || email.split("@")[0];
    if (!email.endsWith(DOMINIO) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return recusar(400, "E-mail fora do domínio.");

    const processo = String(corpo.processo || "").trim().slice(0, 200);
    const convidado_por = String(corpo.convidado_por || "").trim().slice(0, 120) || "A equipe de processos";
    const nota = String(corpo.nota || "").trim().slice(0, 500);
    let link;
    try { link = new URL(String(corpo.link || "")); } catch { return recusar(400, "Link inválido."); }
    if (link.protocol !== "https:" || !HOSTS_DO_APP.includes(link.hostname) || !link.pathname.startsWith("/app/entrevistas/")) return recusar(400, "Link fora do app.");
    if (!processo) return recusar(400, "Convite sem processo.");

    const finalidade = corpo.finalidade === "regras" ? "regras" : "processo";

    return { email, nome, processo, convidado_por, nota, link: link.href, finalidade };
  },
});
