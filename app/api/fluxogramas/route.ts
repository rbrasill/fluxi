import { z } from 'zod';
import { responder } from '@/lib/server/http';
import { criar, listar } from '@/lib/server/fluxogramas';

const Novo = z.object({ nome: z.string().trim().min(1).max(200), xml: z.string().max(5_000_000).optional(), origem: z.enum(['manual', 'modelo']).optional() });

export const GET = () => responder(listar);
export const POST = (req: Request) => responder(async () => criar(Novo.parse(await req.json())));
