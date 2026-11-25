import { z } from 'zod';
import { responder } from '@/lib/server/http';
import { criar, listar } from '@/lib/server/pops';
import { pessoaLogada } from '@/lib/server/sessao';

export const dynamic = 'force-dynamic';
const Novo = z.object({ nome: z.string().trim().max(200).optional(), processo_id: z.string().uuid().optional() });

export const GET = (req: Request) => responder(() => listar(new URL(req.url).searchParams.get('arquivados') === '1'));
/** "Elaborado por" sai de quem está logado (decisão 137). */
export const POST = (req: Request) => responder(async () => { const dados = Novo.parse(await req.json()); return criar(dados, (await pessoaLogada())?.nome ?? ''); });
