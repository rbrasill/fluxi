import { z } from 'zod';
import { responder } from '@/lib/server/http';
import { criar, listar } from '@/lib/server/pops';

export const dynamic = 'force-dynamic';
const Novo = z.object({ nome: z.string().trim().max(200).optional(), gravacao_id: z.string().uuid().optional(), fluxograma_id: z.string().uuid().optional(), processo_id: z.string().uuid().optional() });

export const GET = (req: Request) => responder(() => listar(new URL(req.url).searchParams.get('arquivados') === '1'));
export const POST = (req: Request) => responder(async () => criar(Novo.parse(await req.json())));
