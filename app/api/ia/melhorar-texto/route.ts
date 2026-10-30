import { z } from 'zod';
import { responder } from '@/lib/server/http';
import { melhorarTexto } from '@/lib/server/melhorar-texto';

const Pedido = z.object({
  campo: z.enum(['passo', 'objetivo']),
  texto: z.string().max(20_000, 'Texto grande demais para revisar de uma vez.'),
  pop: z.string().max(300).optional(),
  procedimento: z.string().max(300).optional(),
  numero: z.number().int().min(1).max(999).optional(),
  anterior: z.string().max(20_000).optional(),
  seguinte: z.string().max(20_000).optional(),
});

export const dynamic = 'force-dynamic';
// Dois modelos em cascata, até 25 s cada.
export const maxDuration = 60;

/** Revisa o texto de um passo ou do objetivo do POP com IA (Groq). Só sugere: quem decide é a pessoa. */
export const POST = (req: Request) => responder(async () => melhorarTexto(Pedido.parse(await req.json())));
