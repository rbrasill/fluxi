import { z } from 'zod';
import { responder } from '@/lib/server/http';
import { iniciar } from '@/lib/server/transcricao';

export const POST = (req: Request) =>
  responder(async () => {
    const { caminho } = z.object({ caminho: z.string().min(1) }).parse(await req.json());
    return iniciar(caminho);
  });
