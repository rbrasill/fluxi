import { responder } from '@/lib/server/http';
import { excluirTela } from '@/lib/server/pops';

export const DELETE = (_: Request, { params }: { params: Promise<{ id: string; tid: string }> }) =>
  responder(async () => {
    const { id, tid } = await params;
    return excluirTela(id, tid);
  });
