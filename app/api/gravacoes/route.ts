import { z } from 'zod';
import { criar, listar } from '@/lib/server/gravacoes';
import { responder } from '@/lib/server/http';

export const dynamic = 'force-dynamic';
export const GET = () => responder(listar);
export const POST = (req: Request) =>
  responder(async () => criar(z.object({ nome: z.string().trim().min(1).max(200) }).parse(await req.json()).nome));
