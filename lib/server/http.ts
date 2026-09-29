import 'server-only';
import { NextResponse } from 'next/server';
import { ZodError } from 'zod';

export class ErroApi extends Error {
  constructor(public status: number, message: string, public codigo?: string) {
    super(message);
  }
}

export function responder<T>(fn: () => Promise<T>) {
  return fn()
    .then((dados) => NextResponse.json(dados ?? null))
    .catch((e: unknown) => {
      if (e instanceof ZodError) return NextResponse.json({ erro: e.issues[0]?.message || 'Dados inválidos' }, { status: 400 });
      if (e instanceof ErroApi) return NextResponse.json({ erro: e.message, codigo: e.codigo }, { status: e.status });
      console.error(e);
      return NextResponse.json({ erro: e instanceof Error ? e.message : 'Erro inesperado' }, { status: 500 });
    });
}
