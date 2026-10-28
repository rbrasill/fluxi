import { z } from 'zod';
import { responder } from '@/lib/server/http';
import { criarTela } from '@/lib/server/pops';

const Tela = z.object({ imagem_caminho: z.string().min(1).max(400), largura: z.number().int().positive().optional(), altura: z.number().int().positive().optional() });

/** Registra um print anexado no POP (o arquivo já foi enviado ao Storage). */
export const POST = (req: Request, { params }: { params: Promise<{ id: string }> }) =>
  responder(async () => criarTela((await params).id, Tela.parse(await req.json())));
