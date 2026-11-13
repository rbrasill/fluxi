import { responder } from '@/lib/server/http';
import { NovaRegraSchema, criar, listar } from '@/lib/server/regras';
import { pessoaLogada } from '@/lib/server/sessao';

type Ctx = { params: Promise<{ id: string }> };
export const dynamic = 'force-dynamic';

/** As regras de negócio do processo (decisão 89): as sugeridas pela Maia para revisar e as confirmadas. */
export const GET = (_: Request, { params }: Ctx) => responder(async () => listar((await params).id, await pessoaLogada()));

/** Regra escrita à mão por quem confirma as regras do processo: já nasce confirmada. */
export const POST = (req: Request, { params }: Ctx) =>
  responder(async () => criar((await params).id, NovaRegraSchema.parse(await req.json()), await pessoaLogada()));
