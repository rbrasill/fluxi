import { z } from 'zod';
import { responder } from '@/lib/server/http';
import { copiar } from '@/lib/server/pops';

const Pedido = z.object({ processo_id: z.string().uuid(), nome: z.string().trim().max(200).optional() });

/** Copia o POP para um processo (decisão 36): a cópia nasce como rascunho, com os prints copiados. */
export const POST = (req: Request, { params }: { params: Promise<{ id: string }> }) =>
  responder(async () => copiar((await params).id, Pedido.parse(await req.json())));
