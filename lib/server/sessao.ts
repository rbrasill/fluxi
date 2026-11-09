import 'server-only';
import { cookies } from 'next/headers';
import { COOKIE_SESSAO, DURACAO_SESSAO_S } from '@/lib/auth/sessao';
import { ErroApi } from './http';
import { emProducao, pessoaDaSessao, segredo, type Pessoa } from './login';

// A sessão nas rotas: o porteiro (proxy.ts) já barra quem não tem cookie válido, mas toda rota que lê ou
// grava dado confere de novo, agora com o banco (a pessoa ainda existe? a sessão não foi revogada?).

/**
 * A pessoa logada. Sem INC_AUTH_SECRET: em produção, 503 (o app nunca abre sozinho); em desenvolvimento,
 * null (modo aberto, só para `npm run dev`).
 */
export async function pessoaLogada(): Promise<Pessoa | null> {
  if (!segredo()) {
    if (emProducao()) throw new ErroApi(503, 'O login ainda não está configurado (falta INC_AUTH_SECRET).');
    return null;
  }
  const p = await pessoaDaSessao((await cookies()).get(COOKIE_SESSAO)?.value);
  if (!p) throw new ErroApi(401, 'Faça login para continuar.', 'sessao');
  return p;
}

export async function exigirAdmin(): Promise<Pessoa | null> {
  const p = await pessoaLogada();
  if (p && p.nivel !== 'admin') throw new ErroApi(403, 'Só administradores podem fazer isso.');
  return p;
}

/** Gestor ou administrador (convidar para entrevistas, por exemplo). */
export async function exigirGestor(): Promise<Pessoa | null> {
  const p = await pessoaLogada();
  if (p && p.nivel === 'comum') throw new ErroApi(403, 'Só gestores e administradores podem fazer isso.');
  return p;
}

const atributos = () => ({ httpOnly: true, secure: emProducao(), sameSite: 'lax' as const, path: '/' });

export async function gravarCookieDeSessao(token: string) {
  (await cookies()).set(COOKIE_SESSAO, token, { ...atributos(), maxAge: DURACAO_SESSAO_S });
}

export async function apagarCookieDeSessao() {
  (await cookies()).set(COOKIE_SESSAO, '', { ...atributos(), maxAge: 0 });
}

export async function tokenDoCookie() {
  return (await cookies()).get(COOKIE_SESSAO)?.value;
}
