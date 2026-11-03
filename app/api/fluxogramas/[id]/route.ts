import { z } from 'zod';
import { responder } from '@/lib/server/http';
import { atualizar, excluir, obter } from '@/lib/server/fluxogramas';

type Ctx = { params: Promise<{ id: string }> };
const Patch = z.object({
  nome: z.string().trim().min(1).max(200).optional(),
  xml: z.string().max(5_000_000).optional(),
  miniatura: z.string().max(2_000_000).optional(),
  // SVG exportado pelo editor (draw.io), para a página pública do fluxograma.
  svg: z.string().max(4_000_000, 'O fluxograma ficou grande demais para publicar.').refine((s) => /^\s*(<\?xml[^>]*>\s*)?(<!DOCTYPE[^>]*>\s*)?<svg[\s>]/i.test(s), 'SVG inválido').optional(),
  processo_id: z.string().uuid().nullable().optional(),
});

export const GET = (_: Request, { params }: Ctx) => responder(async () => obter((await params).id));
export const PATCH = (req: Request, { params }: Ctx) => responder(async () => atualizar((await params).id, Patch.parse(await req.json())));
export const DELETE = (_: Request, { params }: Ctx) => responder(async () => excluir((await params).id));
