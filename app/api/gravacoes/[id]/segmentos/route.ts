import { z } from 'zod';
import { registrarSegmento } from '@/lib/server/gravacoes';
import { responder } from '@/lib/server/http';

const Segmento = z.object({
  indice: z.number().int().min(0),
  caminho: z.string().min(1),
  inicio_ms: z.number().int().min(0),
  duracao_ms: z.number().int().min(0),
  bytes: z.number().int().min(0),
  mime: z.string().min(1).max(100),
});

export const POST = (req: Request, { params }: { params: Promise<{ id: string }> }) =>
  responder(async () => registrarSegmento((await params).id, Segmento.parse(await req.json())));
