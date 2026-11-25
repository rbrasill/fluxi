import { z } from 'zod';
import { responder } from '@/lib/server/http';
import { definirIcone } from '@/lib/server/processos';

/** Escolhe (ou tira, com `nome: null`) o ícone do processo (decisão 133). O desenho sai do catálogo do servidor. */
const Corpo = z.object({ nome: z.string().trim().min(1).max(80).nullable(), cor: z.number().int().min(0).max(7).nullable().optional() });
export const PUT = (req: Request, { params }: { params: Promise<{ id: string }> }) =>
  responder(async () => { const c = Corpo.parse(await req.json()); return definirIcone((await params).id, c.nome, c.cor ?? null); });
