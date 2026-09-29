import { z } from 'zod';
import { responder } from '@/lib/server/http';
import { criar, listar } from '@/lib/server/pops';

export const dynamic = 'force-dynamic';
const Novo = z.object({ nome: z.string().trim().max(200).optional(), gravacao_id: z.string().uuid().optional(), fluxograma_id: z.string().uuid().optional() });

export const GET = () => responder(listar);
export const POST = (req: Request) => responder(async () => criar(Novo.parse(await req.json())));
