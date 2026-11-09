import { ConsultaPedidoSchema, consultar } from '@/lib/server/entrevistas';
import { responder } from '@/lib/server/http';
import { pessoaLogada } from '@/lib/server/sessao';

type Ctx = { params: Promise<{ id: string }> };
export const maxDuration = 30;

/** Uma consulta da Maia no meio da conversa ("deixa eu ver aqui"): o Claude lê o fim da conversa e responde (decisão 44). */
export const POST = (req: Request, { params }: Ctx) =>
  responder(async () => consultar((await params).id, ConsultaPedidoSchema.parse(await req.json()).turnos, await pessoaLogada()));
