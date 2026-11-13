import { responder } from '@/lib/server/http';
import { AlteracaoSchema, alterar } from '@/lib/server/regras';
import { pessoaLogada } from '@/lib/server/sessao';

type Ctx = { params: Promise<{ id: string }> };

/**
 * Edita uma regra (texto, tipo, a que se aplica) ou muda a situação dela: confirmar, descartar, arquivar, perguntar
 * na próxima entrevista (decisão 89). Só quem confirma as regras do processo e os administradores.
 */
export const PATCH = (req: Request, { params }: Ctx) =>
  responder(async () => alterar((await params).id, AlteracaoSchema.parse(await req.json()), await pessoaLogada()));
