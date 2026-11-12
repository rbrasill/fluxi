import { responder } from '@/lib/server/http';
import { paraRevisar } from '@/lib/server/regras';
import { pessoaLogada } from '@/lib/server/sessao';

export const dynamic = 'force-dynamic';

/** Os processos com regras sugeridas à espera de quem está logado (decisão 89), para o aviso do Início. */
export const GET = () => responder(async () => paraRevisar(await pessoaLogada()));
