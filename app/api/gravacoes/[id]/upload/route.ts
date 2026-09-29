import { z } from 'zod';
import { urlDeUpload } from '@/lib/server/gravacoes';
import { responder } from '@/lib/server/http';

const Pedido = z.object({ tipo: z.enum(['segmento', 'imagem']), extensao: z.string().min(1).max(5) });

export const POST = (req: Request, { params }: { params: Promise<{ id: string }> }) =>
  responder(async () => {
    const p = Pedido.parse(await req.json());
    return urlDeUpload((await params).id, p.tipo, p.extensao);
  });
