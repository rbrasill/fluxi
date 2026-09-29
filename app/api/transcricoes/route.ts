import { z } from 'zod';
import { debitar, garantirSaldo } from '@/lib/server/creditos';
import { responder } from '@/lib/server/http';
import { iniciar } from '@/lib/server/transcricao';

export const POST = (req: Request) =>
  responder(async () => {
    const { caminho } = z.object({ caminho: z.string().min(1) }).parse(await req.json());
    await garantirSaldo('transcricao');
    const t = await iniciar(caminho);
    const creditos = await debitar('transcricao', { transcricao_id: t.id });
    return { ...t, creditos };
  });
