import { IniciarSchema, iniciarAgora } from '@/lib/server/entrevistas';
import { responder } from '@/lib/server/http';
import { pessoaLogada } from '@/lib/server/sessao';

type Ctx = { params: Promise<{ id: string }> };

/**
 * Entrevista imediata (decisão 74): abre na hora a entrevista de quem está logado sobre este processo, sem convite
 * nem e-mail. Só para quem pode (por enquanto, administradores; a regra fica em `podeIniciarSemConvite`).
 */
export const POST = (req: Request, { params }: Ctx) =>
  responder(async () => {
    const d = IniciarSchema.parse(await req.json().catch(() => ({}))); // sem corpo: mapeamento de processo
    return iniciarAgora((await params).id, await pessoaLogada(), d.finalidade ?? 'processo');
  });
