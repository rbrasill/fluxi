import { iniciarAgora } from '@/lib/server/entrevistas';
import { responder } from '@/lib/server/http';
import { pessoaLogada } from '@/lib/server/sessao';

type Ctx = { params: Promise<{ id: string }> };

/**
 * Entrevista imediata (decisão 74): abre na hora a entrevista de quem está logado sobre este processo, sem convite
 * nem e-mail. Só para quem pode (por enquanto, administradores; a regra fica em `podeIniciarSemConvite`).
 */
export const POST = (_: Request, { params }: Ctx) => responder(async () => iniciarAgora((await params).id, await pessoaLogada()));
