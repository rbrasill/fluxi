import { z } from 'zod';
import { copiarProcesso } from '@/lib/server/copia';
import { responder } from '@/lib/server/http';

const Pedido = z.object({ area_id: z.string().uuid(), nome: z.string().trim().max(200).optional() });

/** Copia o processo para uma área (decisão 36), com a descrição, o fluxograma e cópias dos POPs ativos. */
export const POST = (req: Request, { params }: { params: Promise<{ id: string }> }) =>
  responder(async () => copiarProcesso((await params).id, Pedido.parse(await req.json())));
