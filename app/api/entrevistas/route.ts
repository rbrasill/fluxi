import { z } from 'zod';
import { criar, listar } from '@/lib/server/entrevistas';
import { responder } from '@/lib/server/http';

export const dynamic = 'force-dynamic';

/** Entrevistas de teste (decisão 41), da mais recente para a mais antiga. */
export const GET = () => responder(listar);

/** Abre uma entrevista: só o tema (o processo a mapear, em texto) e um contexto opcional. */
export const POST = (req: Request) =>
  responder(async () => criar(z.object({
    tema: z.string().trim().min(3, 'Diga qual processo vai ser mapeado.').max(200),
    contexto: z.string().trim().max(2000).optional(),
  }).parse(await req.json())));
