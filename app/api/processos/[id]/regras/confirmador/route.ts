import { responder } from '@/lib/server/http';
import { ConfirmadorSchema, definirConfirmador } from '@/lib/server/regras';
import { exigirGestor } from '@/lib/server/sessao';

type Ctx = { params: Promise<{ id: string }> };

/** Escolhe quem confirma as regras do processo (decisão 89): gestores e administradores. `pessoa: null` tira a escolha. */
export const PUT = (req: Request, { params }: Ctx) =>
  responder(async () => {
    await exigirGestor();
    return definirConfirmador((await params).id, ConfirmadorSchema.parse(await req.json()));
  });
