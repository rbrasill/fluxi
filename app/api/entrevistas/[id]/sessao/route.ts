import { z } from 'zod';
import { abrirSessao } from '@/lib/server/entrevistas';
import { responder } from '@/lib/server/http';

type Ctx = { params: Promise<{ id: string }> };
export const maxDuration = 30;

/** Abre a sessão de voz no GPT-Live: recebe a oferta WebRTC do navegador e devolve a resposta (SDP). */
export const POST = (req: Request, { params }: Ctx) =>
  responder(async () => abrirSessao((await params).id, z.object({ sdp: z.string().min(10).max(50_000) }).parse(await req.json()).sdp));
