import { z } from 'zod';
import { excluir, obter, registrarAudio } from '@/lib/server/entrevistas';
import { responder } from '@/lib/server/http';
import { exigirGestor, pessoaLogada } from '@/lib/server/sessao';

type Ctx = { params: Promise<{ id: string }> };
export const dynamic = 'force-dynamic';

export const GET = (_: Request, { params }: Ctx) => responder(async () => obter((await params).id));
/** Registra o áudio da conversa já enviado ao Storage (só a pessoa entrevistada). */
export const PATCH = (req: Request, { params }: Ctx) =>
  responder(async () => registrarAudio((await params).id, z.object({ audio_caminho: z.string().min(1) }).parse(await req.json()).audio_caminho, await pessoaLogada()));
/** Cancela um convite (gestores e administradores) ou exclui uma entrevista que já começou, inteira (só administradores; decisão 54). */
export const DELETE = (_: Request, { params }: Ctx) => responder(async () => { const quem = await exigirGestor(); await excluir((await params).id, quem); return { ok: true }; });
