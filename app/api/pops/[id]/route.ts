import { z } from 'zod';
import { ConteudoPopSchema, HistoricoSchema } from '@/lib/pop/schema';
import { responder } from '@/lib/server/http';
import { atualizar, excluir, obter } from '@/lib/server/pops';

type Ctx = { params: Promise<{ id: string }> };
const Patch = z.object({
  nome: z.string().trim().min(1).max(200).optional(),
  identificacao: z.string().trim().max(40).optional(),
  versao: z.string().trim().min(1).max(20).optional(),
  conteudo: ConteudoPopSchema.optional(),
  historico: z.array(HistoricoSchema).optional(),
  fluxograma_id: z.string().uuid().nullable().optional(),
  processo_id: z.string().uuid().nullable().optional(),
  status: z.enum(['rascunho', 'publicado']).optional(),
});

export const dynamic = 'force-dynamic';
export const GET = (_: Request, { params }: Ctx) => responder(async () => obter((await params).id));
export const PATCH = (req: Request, { params }: Ctx) => responder(async () => atualizar((await params).id, Patch.parse(await req.json())));
export const DELETE = (_: Request, { params }: Ctx) => responder(async () => excluir((await params).id));
