import { responder } from '@/lib/server/http';
import { arquivar } from '@/lib/server/processos';

/** Arquiva o processo: some das listas com os POPs, gravações e fluxograma dele. Nada é apagado. */
export const POST = (_: Request, { params }: { params: Promise<{ id: string }> }) => responder(async () => arquivar((await params).id, true));
