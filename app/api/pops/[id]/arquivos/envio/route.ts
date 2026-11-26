import { z } from 'zod';
import { MAX_NOME } from '@/lib/anexos';
import { urlDeEnvio } from '@/lib/server/anexos';
import { responder } from '@/lib/server/http';

export const dynamic = 'force-dynamic';
const Pedido = z.object({ nome: z.string().min(1).max(MAX_NOME * 2), tamanho: z.number().int().nonnegative() });

/** Endereço para o navegador enviar um arquivo do POP direto ao Storage (decisão 141). */
export const POST = (req: Request, { params }: { params: Promise<{ id: string }> }) =>
  responder(async () => urlDeEnvio((await params).id, Pedido.parse(await req.json())));
