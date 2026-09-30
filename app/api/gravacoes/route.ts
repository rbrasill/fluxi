import { z } from 'zod';
import { criar, listar } from '@/lib/server/gravacoes';
import { responder } from '@/lib/server/http';

export const dynamic = 'force-dynamic';
export const GET = () => responder(listar);
export const POST = (req: Request) =>
  responder(async () => {
    const p = z.object({ nome: z.string().trim().min(1).max(200), processo_id: z.string().uuid().optional() }).parse(await req.json());
    return criar(p.nome, p.processo_id);
  });
