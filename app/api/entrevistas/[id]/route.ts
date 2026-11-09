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
/** Cancela um convite ou exclui uma entrevista (conversa, áudio e resultado): gestores e administradores. */
export const DELETE = (_: Request, { params }: Ctx) => responder(async () => { await exigirGestor(); await excluir((await params).id); return { ok: true }; });
