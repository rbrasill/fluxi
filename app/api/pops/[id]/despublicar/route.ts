import { responder } from '@/lib/server/http';
import { despublicar } from '@/lib/server/publicacao';

/** Volta o POP para rascunho: a página pública deixa de mostrá-lo. */
export const POST = (_: Request, { params }: { params: Promise<{ id: string }> }) => responder(async () => despublicar((await params).id));
