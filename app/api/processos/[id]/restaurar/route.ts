import { responder } from '@/lib/server/http';
import { arquivar } from '@/lib/server/processos';

/** Tira o processo do arquivo: volta às listas com tudo o que tem. */
export const POST = (_: Request, { params }: { params: Promise<{ id: string }> }) => responder(async () => arquivar((await params).id, false));
