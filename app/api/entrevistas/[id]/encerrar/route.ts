import { encerrar } from '@/lib/server/entrevistas';
import { responder } from '@/lib/server/http';
import { pessoaLogada } from '@/lib/server/sessao';

type Ctx = { params: Promise<{ id: string }> };
export const maxDuration = 300; // a análise da conversa inteira pode levar mais de um minuto

/** Encerra a conversa e gera a descrição, a ficha e as pendências (a pessoa entrevistada; gestores podem gerar de novo). */
export const POST = (_: Request, { params }: Ctx) => responder(async () => encerrar((await params).id, await pessoaLogada()));
