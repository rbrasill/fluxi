// A sessão do login (decisão 50): token sem estado no servidor, assinado com HMAC-SHA256.
//   token = payload "." assinatura; payload = base64url(JSON { e: email, x: expira (s), v: versão da sessão })
// Só Web Crypto (crypto.subtle), para o mesmo código rodar no porteiro (proxy.ts) e nas rotas.
// A assinatura prova que o token foi emitido aqui; quem confere se a pessoa ainda está cadastrada e se a
// sessão não foi revogada (versão) são as rotas, com o banco.

export const COOKIE_SESSAO = 'inc_sessao';
export const DURACAO_SESSAO_S = 6 * 60 * 60; // o dia de trabalho, sem "lembrar de mim"

export type Sessao = { email: string; versao: number; expira: number };

const texto = new TextEncoder();

function paraB64url(bytes: Uint8Array) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function deB64url(s: string) {
  if (!/^[A-Za-z0-9_-]*$/.test(s)) throw new Error('base64url inválido');
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4));
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
}

const chave = (segredo: string) => crypto.subtle.importKey('raw', texto.encode(segredo), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);

export async function assinarSessao(email: string, versao: number, segredo: string, agora = Date.now()) {
  const payload = paraB64url(texto.encode(JSON.stringify({ e: email, x: Math.floor(agora / 1000) + DURACAO_SESSAO_S, v: versao })));
  const assinatura = new Uint8Array(await crypto.subtle.sign('HMAC', await chave(segredo), texto.encode(payload)));
  return `${payload}.${paraB64url(assinatura)}`;
}

/** Confere a assinatura (em tempo constante) e a validade. Qualquer falha: null, sem dizer o motivo. */
export async function lerSessao(token: string | null | undefined, segredo: string): Promise<Sessao | null> {
  if (!token || !segredo) return null;
  const partes = token.split('.');
  if (partes.length !== 2) return null;
  try {
    const ok = await crypto.subtle.verify('HMAC', await chave(segredo), deB64url(partes[1]) as BufferSource, texto.encode(partes[0]));
    if (!ok) return null;
    const d = JSON.parse(new TextDecoder().decode(deB64url(partes[0])));
    if (typeof d?.e !== 'string' || typeof d?.x !== 'number' || d.x * 1000 <= Date.now()) return null;
    return { email: d.e, versao: typeof d.v === 'number' ? d.v : 0, expira: d.x };
  } catch {
    return null;
  }
}

/** Para onde ir depois do login: só caminhos do próprio site (evita redirecionar para fora, inclusive "/\site"). */
export function destinoSeguro(bruto: string | null | undefined, origem: string) {
  try {
    const u = new URL(bruto || '/', origem);
    if (u.origin === origem) return u.pathname + u.search + u.hash;
  } catch { /* cai no início */ }
  return '/';
}
