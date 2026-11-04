import { z } from 'zod';
import { responder } from '@/lib/server/http';
import { definirLinkPublico } from '@/lib/server/processos';

/** Liga (online) ou desliga (offline) a página pública do processo (decisão 35). */
const Corpo = z.object({ ativo: z.boolean() });
export const PUT = (req: Request, { params }: { params: Promise<{ id: string }> }) =>
  responder(async () => definirLinkPublico((await params).id, Corpo.parse(await req.json()).ativo));
