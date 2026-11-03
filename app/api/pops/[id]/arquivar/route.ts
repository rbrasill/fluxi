import { responder } from '@/lib/server/http';
import { arquivar } from '@/lib/server/pops';

/** Arquiva o POP: some das listas e não pode ser editado. Nada é apagado. */
export const POST = (_: Request, { params }: { params: Promise<{ id: string }> }) => responder(async () => arquivar((await params).id, true));
