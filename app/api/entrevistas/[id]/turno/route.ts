import { z } from 'zod';
import { responderTurno } from '@/lib/server/entrevistas';
import { responder } from '@/lib/server/http';

type Ctx = { params: Promise<{ id: string }> };
export const maxDuration = 60;

const Pedido = z.object({
  texto: z.string().trim().min(1, 'Nada foi entendido.').max(6000),
  // A pessoa falou por cima da IA; `ouviu` é quanto da fala da IA chegou a tocar (0 a 1).
  interrompeu: z.literal(true).optional(),
  ouviu: z.number().min(0).max(1).optional(),
});

/** A pessoa falou (texto da escuta ao vivo): devolve o que a IA diz em seguida. */
export const POST = (req: Request, { params }: Ctx) =>
  responder(async () => {
    const p = Pedido.parse(await req.json());
    return responderTurno((await params).id, p.texto, p.interrompeu ? { interrompeu: true, ouviu: p.ouviu ?? 0.5 } : undefined);
  });
