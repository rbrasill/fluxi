import { z } from 'zod';
import { criarMarcacao } from '@/lib/server/gravacoes';
import { responder } from '@/lib/server/http';

const Marcacao = z.object({
  tempo_ms: z.number().int().min(0),
  imagem_caminho: z.string().min(1),
  instrucao: z.string().max(2000).optional(),
  largura: z.number().int().positive().optional(),
  altura: z.number().int().positive().optional(),
});

export const POST = (req: Request, { params }: { params: Promise<{ id: string }> }) =>
  responder(async () => criarMarcacao((await params).id, Marcacao.parse(await req.json())));
