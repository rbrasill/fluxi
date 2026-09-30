import { z } from 'zod';
import { responder } from '@/lib/server/http';
import { criar, listar } from '@/lib/server/organizacoes';

export const dynamic = 'force-dynamic';
const Nova = z.object({ nome: z.string().trim().min(1).max(160) });

export const GET = () => responder(listar);
export const POST = (req: Request) => responder(async () => criar(Nova.parse(await req.json())));
