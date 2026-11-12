import { RetomarSchema, desistirComplemento, retomar } from '@/lib/server/entrevistas';
import { responder } from '@/lib/server/http';
import { pessoaLogada } from '@/lib/server/sessao';

type Ctx = { params: Promise<{ id: string }> };

/** Volta à ligação para responder pontos que ficaram em aberto (decisão 56): a pessoa entrevistada escolhe; gestores podem marcar para ela. */
export const POST = (req: Request, { params }: Ctx) =>
  responder(async () => retomar((await params).id, RetomarSchema.parse(await req.json()), await pessoaLogada()));

/** Desiste do complemento antes de a conversa continuar: a entrevista volta a concluída, com o resultado que já tinha. */
export const DELETE = (_: Request, { params }: Ctx) => responder(async () => desistirComplemento((await params).id, await pessoaLogada()));
