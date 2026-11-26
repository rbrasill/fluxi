import { responder } from '@/lib/server/http';
import { previaDoPop } from '@/lib/server/previa';
import { pessoaLogada } from '@/lib/server/sessao';

export const dynamic = 'force-dynamic';
/** A prévia do POP antes de publicar (decisão 149): só para quem criou o POP; os outros recebem 403. */
export const GET = (_: Request, { params }: { params: Promise<{ id: string }> }) =>
  responder(async () => previaDoPop((await params).id, await pessoaLogada()));
