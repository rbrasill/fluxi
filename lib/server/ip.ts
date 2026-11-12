import 'server-only';

/** O IP de quem pediu: o primeiro valor de X-Forwarded-For, que a Vercel preenche (proxy conhecido). */
export function ipDoPedido(req: Request) {
  return (req.headers.get('x-forwarded-for')?.split(',')[0] || req.headers.get('x-real-ip') || 'desconhecido').trim();
}
