import { responder } from '@/lib/server/http';
import { PessoaAlteracaoSchema, alterar, excluir } from '@/lib/server/pessoas';
import { exigirAdmin } from '@/lib/server/sessao';

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = (req: Request, { params }: Ctx) =>
  responder(async () => { const quem = await exigirAdmin(); return alterar((await params).id, PessoaAlteracaoSchema.parse(await req.json()), quem); });
export const DELETE = (_: Request, { params }: Ctx) =>
  responder(async () => { const quem = await exigirAdmin(); return excluir((await params).id, quem); });
