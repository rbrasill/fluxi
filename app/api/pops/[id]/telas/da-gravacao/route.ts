import { z } from 'zod';
import { responder } from '@/lib/server/http';
import { adicionarTelasDaGravacao } from '@/lib/server/pops';

/** Acrescenta ao POP as telas de uma gravação que ainda não estão nele. */
export const POST = (req: Request, { params }: { params: Promise<{ id: string }> }) =>
  responder(async () => adicionarTelasDaGravacao((await params).id, z.object({ gravacao_id: z.string().uuid() }).parse(await req.json()).gravacao_id));
