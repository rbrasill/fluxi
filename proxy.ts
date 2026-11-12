import { NextResponse, type NextRequest } from 'next/server';
import { COOKIE_SESSAO, lerSessao } from '@/lib/auth/sessao';

// O porteiro do login (decisão 50), roda antes de toda página e rota de API. É a primeira camada: confere
// só a assinatura e a validade do cookie; as rotas conferem de novo com o banco (pessoa ainda cadastrada,
// sessão não revogada). Sem INC_AUTH_SECRET, em produção tudo responde 503: o app nunca abre sozinho.

// Abertos sem login: a tela de login e suas rotas, e as páginas públicas de POP, fluxograma e processo.
const PUBLICAS = [/^\/login\/?$/, /^\/api\/auth\//, /^\/p\//, /^\/f\//, /^\/pr\//, /^\/api\/publico\//];
// Arquivos estáticos da pasta public, por extensão conhecida (fora de /api: "/api/x/qualquer.svg" não passa).
const ESTATICO = /^\/(?!api\/)[^?]*\.(svg|png|jpg|jpeg|webp|gif|ico|woff2|txt|xml|webmanifest)$/i;
const ESCRITA = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

const json = (status: number, erro: string) => NextResponse.json({ erro }, { status, headers: { 'Cache-Control': 'no-store' } });

/** Escrita na API só vinda do próprio site (Origin igual ao host, ou Sec-Fetch-Site same-origin). */
function mesmaOrigem(req: NextRequest) {
  if (req.headers.get('sec-fetch-site') === 'same-origin') return true;
  const origem = req.headers.get('origin');
  if (!origem) return false;
  try {
    return new URL(origem).host === (req.headers.get('x-forwarded-host') || req.headers.get('host'));
  } catch {
    return false;
  }
}

export async function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const segredo = process.env.INC_AUTH_SECRET || '';
  if (!segredo) {
    if (process.env.NODE_ENV === 'production') return json(503, 'O login ainda não está configurado (falta INC_AUTH_SECRET).');
    return NextResponse.next(); // desenvolvimento sem login: aberto
  }
  const api = pathname.startsWith('/api/');
  if (api && ESCRITA.has(req.method) && !mesmaOrigem(req)) return json(403, 'Pedido de outra origem recusado.');
  if (PUBLICAS.some((r) => r.test(pathname)) || ESTATICO.test(pathname)) return NextResponse.next();
  if (await lerSessao(req.cookies.get(COOKIE_SESSAO)?.value, segredo)) return NextResponse.next();
  if (api) return json(401, 'Faça login para continuar.');
  const login = new URL('/login', req.url);
  login.searchParams.set('next', pathname + search);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image).*)'],
};
