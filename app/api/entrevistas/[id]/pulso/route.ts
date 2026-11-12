import { pulsoDaLigacao } from '@/lib/server/entrevistas';
import { responder } from '@/lib/server/http';
import { pessoaLogada } from '@/lib/server/sessao';

type Ctx = { params: Promise<{ id: string }> };

/** O pulso da ligação: o navegador da pessoa entrevistada avisa que a conversa com a Maia continua (decisão 69). */
export const POST = (_: Request, { params }: Ctx) => responder(async () => pulsoDaLigacao((await params).id, await pessoaLogada()));
/** A página da ligação fechou: a entrevista deixa de contar como "em andamento" na hora, sem esperar o prazo vencer. */
export const DELETE = (_: Request, { params }: Ctx) => responder(async () => pulsoDaLigacao((await params).id, await pessoaLogada(), false));
