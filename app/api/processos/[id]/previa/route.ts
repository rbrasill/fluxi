import { responder } from '@/lib/server/http';
import { previaDoProcesso } from '@/lib/server/previa';
import { pessoaLogada } from '@/lib/server/sessao';

export const dynamic = 'force-dynamic';
/** A prévia do processo antes de publicar (decisão 149): só para quem criou o processo; os outros recebem 403. */
export const GET = (_: Request, { params }: { params: Promise<{ id: string }> }) =>
  responder(async () => previaDoProcesso((await params).id, await pessoaLogada()));
