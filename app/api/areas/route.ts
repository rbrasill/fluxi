import { z } from 'zod';
import { criar, listar } from '@/lib/server/areas';
import { responder } from '@/lib/server/http';

export const dynamic = 'force-dynamic';
const Nova = z.object({
  nome: z.string().trim().min(1).max(120),
  organizacao_id: z.string({ error: 'Escolha a organização.' }).uuid({ error: 'Escolha a organização.' }),
  descricao: z.string().trim().max(2000).optional() });

export const GET = () => responder(listar);
export const POST = (req: Request) => responder(async () => criar(Nova.parse(await req.json())));
