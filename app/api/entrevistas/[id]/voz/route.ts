import { z } from 'zod';
import { voz } from '@/lib/server/entrevistas';
import { responder } from '@/lib/server/http';

type Ctx = { params: Promise<{ id: string }> };
export const maxDuration = 60;

/** A fala da IA em áudio (WAV). Erros vêm em JSON, como nas outras rotas. */
export async function POST(req: Request, { params }: Ctx) {
  try {
    const { texto } = z.object({ texto: z.string().trim().min(1).max(5000) }).parse(await req.json());
    const { audio, tipo } = await voz((await params).id, texto);
    return new Response(audio, { headers: { 'content-type': tipo, 'cache-control': 'no-store' } });
  } catch (e) {
    return responder(() => Promise.reject(e));
  }
}
