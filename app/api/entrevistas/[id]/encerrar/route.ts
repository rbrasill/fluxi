import { encerrar } from '@/lib/server/entrevistas';
import { responder } from '@/lib/server/http';

type Ctx = { params: Promise<{ id: string }> };
export const maxDuration = 300; // a análise da conversa inteira pode levar mais de um minuto

/** Encerra a conversa e gera a descrição, a ficha e as pendências. */
export const POST = (_: Request, { params }: Ctx) => responder(async () => encerrar((await params).id));
