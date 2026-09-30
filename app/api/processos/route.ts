import { z } from 'zod';
import { responder } from '@/lib/server/http';
import { criar, listar } from '@/lib/server/processos';

export const dynamic = 'force-dynamic';
const Novo = z.object({ nome: z.string().trim().min(1).max(200), area_id: z.string({ error: 'Escolha a área do processo.' }).uuid({ error: 'Escolha a área do processo.' }), descricao: z.string().trim().max(5000).optional() });

export const GET = () => responder(listar);
export const POST = (req: Request) => responder(async () => criar(Novo.parse(await req.json())));
