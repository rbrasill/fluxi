import { z } from 'zod';
import { responder } from '@/lib/server/http';
import { excluirProcesso } from '@/lib/server/exclusao';
import { atualizar, obter } from '@/lib/server/processos';

type Ctx = { params: Promise<{ id: string }> };
const Patch = z.object({ nome: z.string().trim().min(1).max(200).optional(), area_id: z.string().uuid().optional(), descricao: z.string().max(60000).optional() });

export const dynamic = 'force-dynamic';
export const GET = (_: Request, { params }: Ctx) => responder(async () => obter((await params).id));
export const PATCH = (req: Request, { params }: Ctx) => responder(async () => atualizar((await params).id, Patch.parse(await req.json())));
/** Só processo arquivado; apaga tudo o que está dentro. */
export const DELETE = (_: Request, { params }: Ctx) => responder(async () => excluirProcesso((await params).id));
