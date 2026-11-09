import 'server-only';

// Os "carteiros": workflows do Pipedream (ou outro serviço) que só entregam e-mails. Cada tipo de mensagem
// tem o seu workflow, com URL e segredo próprios, para um não mexer no outro:
//   · `codigo`  → AUTH_MAILER_URL / AUTH_MAILER_SECRET       (o código de login, decisão 50; docs/login.md)
//   · `convite` → CONVITE_MAILER_URL / CONVITE_MAILER_SECRET (o convite para entrevista com a Maia, decisão 53; docs/convites.md)
// O carteiro recebe os dados, autentica o servidor pelo segredo e não gera, não valida nem guarda nada.

export type Mensagem =
  | { tipo: 'codigo'; email: string; nome: string; codigo: string }
  | { tipo: 'convite'; email: string; nome: string; processo: string; convidado_por: string; link: string; nota: string };

const CARTEIROS = {
  codigo: { url: 'AUTH_MAILER_URL', segredo: 'AUTH_MAILER_SECRET' },
  convite: { url: 'CONVITE_MAILER_URL', segredo: 'CONVITE_MAILER_SECRET' },
} as const;

export const carteiroConfigurado = (tipo: Mensagem['tipo']) => !!process.env[CARTEIROS[tipo].url];

/** O endereço do app para montar links em e-mails: INC_APP_URL ou a origem do próprio pedido. */
export const origemDoApp = (req: Request) => (process.env.INC_APP_URL || new URL(req.url).origin).replace(/\/$/, '');

/**
 * Entrega a mensagem pelo carteiro do tipo dela. Sem carteiro configurado, escreve no log do servidor
 * (só em desenvolvimento: em produção, quem chama confere `carteiroConfigurado` antes).
 */
export async function enviarEmail(m: Mensagem) {
  const { url: varUrl, segredo: varSegredo } = CARTEIROS[m.tipo];
  const url = process.env[varUrl];
  if (!url) {
    console.info(m.tipo === 'codigo'
      ? `[login] código de ${m.email}: ${m.codigo} (sem carteiro configurado; só em desenvolvimento)`
      : `[convite] ${m.email}: ${m.link} (sem carteiro configurado; só em desenvolvimento)`);
    return;
  }
  // Cada carteiro tem o seu segredo; o segredo das sessões nunca sai do servidor.
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-inc-secret': process.env[varSegredo] || '' },
    body: JSON.stringify(m),
    signal: AbortSignal.timeout(15_000),
  });
  if (!r.ok) throw new Error(`o carteiro respondeu ${r.status}`);
}
