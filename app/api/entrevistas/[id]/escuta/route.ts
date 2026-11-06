import { escuta } from '@/lib/server/entrevistas';
import { responder } from '@/lib/server/http';

type Ctx = { params: Promise<{ id: string }> };

/** Endereço (com token temporário) para o navegador ligar a escuta ao vivo, e os termos a reforçar. */
export const POST = (_: Request, { params }: Ctx) => responder(async () => escuta((await params).id));
