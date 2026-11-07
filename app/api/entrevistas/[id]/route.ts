import { z } from 'zod';
import { excluir, obter, registrarAudio } from '@/lib/server/entrevistas';
import { responder } from '@/lib/server/http';

type Ctx = { params: Promise<{ id: string }> };
export const dynamic = 'force-dynamic';

export const GET = (_: Request, { params }: Ctx) => responder(async () => obter((await params).id));
/** Registra o áudio da conversa já enviado ao Storage. */
export const PATCH = (req: Request, { params }: Ctx) =>
  responder(async () => registrarAudio((await params).id, z.object({ audio_caminho: z.string().min(1) }).parse(await req.json()).audio_caminho));
export const DELETE = (_: Request, { params }: Ctx) => responder(async () => { await excluir((await params).id); return { ok: true }; });
