import { audioDaFala } from '@/lib/server/entrevistas';
import { responder } from '@/lib/server/http';
import { trechoDaRegra } from '@/lib/server/regras';
import { pessoaLogada } from '@/lib/server/sessao';

type Ctx = { params: Promise<{ id: string }> };
export const dynamic = 'force-dynamic';

/** A gravação e o ponto da fala de onde a regra saiu, para ouvir o trecho (decisão 89). */
export const GET = (_: Request, { params }: Ctx) =>
  responder(async () => {
    const pessoa = await pessoaLogada();
    const t = await trechoDaRegra((await params).id);
    return audioDaFala(t.entrevista_id, t.ms, pessoa);
  });
