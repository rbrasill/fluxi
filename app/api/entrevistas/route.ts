import { z } from 'zod';
import { criar, listar } from '@/lib/server/entrevistas';
import { responder } from '@/lib/server/http';

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // a abertura da entrevista passa pela IA

/** Entrevistas de um processo (`?processo_id=`), da mais recente para a mais antiga. */
export const GET = (req: Request) =>
  responder(async () => listar(z.string().uuid().parse(new URL(req.url).searchParams.get('processo_id'))));

/** Abre uma entrevista: devolve o id e a primeira fala da IA. */
export const POST = (req: Request) =>
  responder(async () => criar(z.object({ processo_id: z.string().uuid() }).parse(await req.json()).processo_id));
