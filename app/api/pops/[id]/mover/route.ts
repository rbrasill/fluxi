import { z } from 'zod';
import { responder } from '@/lib/server/http';
import { moverParaArea } from '@/lib/server/pops';

const Pedido = z.object({
  area_id: z.string().uuid(),
  processo_id: z.string().uuid().optional(), // POP sem processo: processo da área de destino
  novo_processo: z.string().trim().max(200).optional(), // POP sem processo e sem processo_id: cria um com este nome
});

/** Move o POP para outra área (com o processo inteiro dele). */
export const POST = (req: Request, { params }: { params: Promise<{ id: string }> }) =>
  responder(async () => moverParaArea((await params).id, Pedido.parse(await req.json())));
