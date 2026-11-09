import 'server-only';
import { NextResponse } from 'next/server';
import { ZodError } from 'zod';

export class ErroApi extends Error {
  constructor(public status: number, message: string, public codigo?: string, public cabecalhos?: Record<string, string>) {
    super(message);
  }
}

/** Rota que lê ou grava dado: exige a pessoa logada (decisão 50) antes de qualquer coisa. */
export function responder<T>(fn: () => Promise<T>) {
  return executar(fn, true);
}

/** Rota pública (páginas públicas de POP e processo, login): sem sessão e sem cache. */
export function responderPublico<T>(fn: () => Promise<T>, opcoes: { semCache?: boolean } = {}) {
  return executar(fn, false, opcoes.semCache);
}

async function executar<T>(fn: () => Promise<T>, exigeLogin: boolean, semCache = false) {
  const extra: Record<string, string> = semCache ? { 'Cache-Control': 'no-store' } : {};
  try {
    // Importado aqui para os módulos de dados não dependerem de next/headers (os testes os chamam direto).
    if (exigeLogin) await (await import('./sessao')).pessoaLogada();
    const dados = await fn();
    return NextResponse.json(dados ?? null, { headers: extra });
  } catch (e: unknown) {
    return respostaDeErro(e, extra);
  }
}

export function respostaDeErro(e: unknown, extra: Record<string, string> = {}) {
  if (e instanceof ZodError) return NextResponse.json({ erro: e.issues[0]?.message || 'Dados inválidos' }, { status: 400, headers: extra });
  if (e instanceof ErroApi) return NextResponse.json({ erro: e.message, codigo: e.codigo }, { status: e.status, headers: { ...extra, ...e.cabecalhos } });
  console.error(e);
  return NextResponse.json({ erro: e instanceof Error ? e.message : 'Erro inesperado' }, { status: 500, headers: extra });
}
