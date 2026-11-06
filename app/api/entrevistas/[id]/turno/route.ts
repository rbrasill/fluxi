import { z } from 'zod';
import { responderTurno } from '@/lib/server/entrevistas';
import { responder } from '@/lib/server/http';

type Ctx = { params: Promise<{ id: string }> };
export const maxDuration = 60;

/** A pessoa falou (texto da escuta ao vivo): devolve o que a IA diz em seguida. */
export const POST = (req: Request, { params }: Ctx) =>
  responder(async () => {
    const { texto } = z.object({ texto: z.string().trim().min(1, 'Nada foi entendido.').max(6000) }).parse(await req.json());
    return responderTurno((await params).id, texto);
  });
