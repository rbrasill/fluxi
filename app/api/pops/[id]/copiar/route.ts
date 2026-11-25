import { z } from 'zod';
import { responder } from '@/lib/server/http';
import { copiar } from '@/lib/server/pops';
import { pessoaLogada } from '@/lib/server/sessao';

const Pedido = z.object({ processo_id: z.string().uuid(), nome: z.string().trim().max(200).optional() });

/** Copia o POP para um processo (decisão 36): a cópia nasce como rascunho, com os prints copiados, e "Elaborado por" é quem copiou (decisão 137). */
export const POST = (req: Request, { params }: { params: Promise<{ id: string }> }) =>
  responder(async () => { const pedido = Pedido.parse(await req.json()); return copiar((await params).id, pedido, (await pessoaLogada())?.nome ?? ''); });
