import { z } from 'zod';
import { responder } from '@/lib/server/http';
import { moverParaProcesso } from '@/lib/server/pops';

const Pedido = z.object({ processo_id: z.string().uuid() });

/** Move o POP para outro processo (decisão 36). */
export const POST = (req: Request, { params }: { params: Promise<{ id: string }> }) =>
  responder(async () => moverParaProcesso((await params).id, Pedido.parse(await req.json()).processo_id));
