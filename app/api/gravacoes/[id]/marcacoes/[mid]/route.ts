import { z } from 'zod';
import { atualizarMarcacao, excluirMarcacao } from '@/lib/server/gravacoes';
import { responder } from '@/lib/server/http';

type Ctx = { params: Promise<{ id: string; mid: string }> };
const Patch = z.object({ instrucao: z.string().max(2000).nullable().optional(), incluir_no_pop: z.boolean().optional() });

export const PATCH = (req: Request, { params }: Ctx) =>
  responder(async () => {
    const { id, mid } = await params;
    return atualizarMarcacao(id, mid, Patch.parse(await req.json()));
  });
export const DELETE = (_: Request, { params }: Ctx) =>
  responder(async () => {
    const { id, mid } = await params;
    return excluirMarcacao(id, mid);
  });
