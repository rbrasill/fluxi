import { z } from 'zod';
import { criar, listar } from '@/lib/server/gravacoes';
import { responder } from '@/lib/server/http';

export const dynamic = 'force-dynamic';
export const GET = () => responder(listar);
export const POST = (req: Request) =>
  responder(async () => {
    // A gravação nasce dentro de um POP (decisão 31).
    const p = z.object({ nome: z.string().trim().min(1).max(200), pop_id: z.string({ error: 'Abra um POP e use “Gravar tela”.' }).uuid() }).parse(await req.json());
    return criar(p.nome, p.pop_id);
  });
