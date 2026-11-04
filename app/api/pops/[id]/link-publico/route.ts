import { z } from 'zod';
import { responder } from '@/lib/server/http';
import { definirLinkPublico } from '@/lib/server/publicacao';

/** Liga (online) ou desliga (offline) a página pública do POP, sem mexer na versão publicada. */
const Corpo = z.object({ ativo: z.boolean() });
export const PUT = (req: Request, { params }: { params: Promise<{ id: string }> }) =>
  responder(async () => definirLinkPublico((await params).id, Corpo.parse(await req.json()).ativo));
