import { ConversaSchema, salvarConversa } from '@/lib/server/entrevistas';
import { responder } from '@/lib/server/http';

type Ctx = { params: Promise<{ id: string }> };

/** A conversa transcrita e as métricas, enviadas pelo navegador durante a sessão e no fim. */
export const PUT = (req: Request, { params }: Ctx) =>
  responder(async () => salvarConversa((await params).id, ConversaSchema.parse(await req.json())));
