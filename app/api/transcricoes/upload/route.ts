import { z } from 'zod';
import { garantirSaldo } from '@/lib/server/creditos';
import { responder } from '@/lib/server/http';
import { urlDeUpload } from '@/lib/server/transcricao';

export const POST = (req: Request) =>
  responder(async () => {
    const { nome } = z.object({ nome: z.string().min(1).max(300) }).parse(await req.json());
    await garantirSaldo('transcricao');
    return urlDeUpload(nome);
  });
