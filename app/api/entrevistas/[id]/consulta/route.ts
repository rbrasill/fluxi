import { ConsultaPedidoSchema, consultar } from '@/lib/server/entrevistas';
import { responder } from '@/lib/server/http';

type Ctx = { params: Promise<{ id: string }> };
export const maxDuration = 30;

/** Uma consulta da IA no meio da conversa ("deixa eu ver aqui"): o navegador manda o fim da conversa e recebe a resposta. */
export const POST = (req: Request, { params }: Ctx) =>
  responder(async () => consultar((await params).id, ConsultaPedidoSchema.parse(await req.json()).turnos));
