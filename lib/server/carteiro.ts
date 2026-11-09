import 'server-only';

// O "carteiro": um workflow do Pipedream (ou outro serviço) que só entrega e-mails. Recebe o tipo da
// mensagem e os dados, autentica o servidor pelo AUTH_MAILER_SECRET e não gera, não valida nem guarda nada.
// Dois tipos: `codigo` (o código de login, decisão 50) e `convite` (entrevista com a Maia, decisão 53).

export type Mensagem =
  | { tipo: 'codigo'; email: string; nome: string; codigo: string }
  | { tipo: 'convite'; email: string; nome: string; processo: string; convidado_por: string; link: string; nota: string };

export const carteiroConfigurado = () => !!process.env.AUTH_MAILER_URL;

/** O endereço do app para montar links em e-mails: INC_APP_URL ou a origem do próprio pedido. */
export const origemDoApp = (req: Request) => (process.env.INC_APP_URL || new URL(req.url).origin).replace(/\/$/, '');

/** Entrega a mensagem. Sem carteiro configurado (só em desenvolvimento), escreve no log do servidor. */
export async function enviarEmail(m: Mensagem) {
  const url = process.env.AUTH_MAILER_URL;
  if (!url) {
    console.info(m.tipo === 'codigo'
      ? `[login] código de ${m.email}: ${m.codigo} (sem carteiro configurado; só em desenvolvimento)`
      : `[convite] ${m.email}: ${m.link} (sem carteiro configurado; só em desenvolvimento)`);
    return;
  }
  // O carteiro tem segredo próprio (AUTH_MAILER_SECRET); o segredo das sessões nunca sai do servidor.
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-inc-secret': process.env.AUTH_MAILER_SECRET || '' },
    body: JSON.stringify(m),
    signal: AbortSignal.timeout(15_000),
  });
  if (!r.ok) throw new Error(`o carteiro respondeu ${r.status}`);
}
