import { z } from 'zod';
import { atualizar, excluir, obter } from '@/lib/server/gravacoes';
import { responder } from '@/lib/server/http';

type Ctx = { params: Promise<{ id: string }> };
const Patch = z.object({
  nome: z.string().trim().min(1).max(200).optional(),
  status: z.enum(['gravando', 'pronta', 'interrompida', 'erro']).optional(),
  duracao_ms: z.number().int().min(0).optional(),
  largura: z.number().int().positive().optional(),
  altura: z.number().int().positive().optional(),
});

export const dynamic = 'force-dynamic';
export const GET = (_: Request, { params }: Ctx) => responder(async () => obter((await params).id));
export const PATCH = (req: Request, { params }: Ctx) => responder(async () => atualizar((await params).id, Patch.parse(await req.json())));
export const DELETE = (_: Request, { params }: Ctx) => responder(async () => excluir((await params).id));
