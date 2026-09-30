import { z } from 'zod';
import { responder } from '@/lib/server/http';
import { atualizar, excluir, obter } from '@/lib/server/processos';

type Ctx = { params: Promise<{ id: string }> };
const Patch = z.object({ nome: z.string().trim().min(1).max(200).optional(), area_id: z.string().uuid().optional(), descricao: z.string().trim().max(5000).optional() });

export const dynamic = 'force-dynamic';
export const GET = (_: Request, { params }: Ctx) => responder(async () => obter((await params).id));
export const PATCH = (req: Request, { params }: Ctx) => responder(async () => atualizar((await params).id, Patch.parse(await req.json())));
export const DELETE = (_: Request, { params }: Ctx) => responder(async () => excluir((await params).id));
