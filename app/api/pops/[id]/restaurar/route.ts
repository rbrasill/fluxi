import { responder } from '@/lib/server/http';
import { arquivar } from '@/lib/server/pops';

/** Tira o POP do arquivo. */
export const POST = (_: Request, { params }: { params: Promise<{ id: string }> }) => responder(async () => arquivar((await params).id, false));
