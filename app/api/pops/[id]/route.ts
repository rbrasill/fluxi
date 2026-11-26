import { z } from 'zod';
import { ConteudoPopSchema, PosicaoSchema } from '@/lib/pop/schema';
import { podeVer } from '@/lib/server/criador';
import { responder } from '@/lib/server/http';
import { excluirPop } from '@/lib/server/exclusao';
import { atualizar, obter } from '@/lib/server/pops';
import { pessoaLogada } from '@/lib/server/sessao';

type Ctx = { params: Promise<{ id: string }> };
const Patch = z.object({
  nome: z.string().trim().min(1).max(200).optional(),
  identificacao: z.string().trim().max(40).optional(),
  conteudo: ConteudoPopSchema.optional(),
  posicao: PosicaoSchema.nullable().optional(),
  processo_id: z.string().uuid().nullable().optional(),
});

export const dynamic = 'force-dynamic';
/** `pode_ver_previa`: só quem criou o POP vê a prévia antes de publicar (decisão 149). */
export const GET = (_: Request, { params }: Ctx) => responder(async () => {
  const { id } = await params;
  const pop = await obter(id);
  return { ...pop, pode_ver_previa: await podeVer('pops', id, await pessoaLogada()) };
});
export const PATCH = (req: Request, { params }: Ctx) => responder(async () => atualizar((await params).id, Patch.parse(await req.json())));
/** Só POP arquivado; as gravações dele vão junto. */
export const DELETE = (_: Request, { params }: Ctx) => responder(async () => excluirPop((await params).id));
