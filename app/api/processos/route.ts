import { z } from 'zod';
import { responder } from '@/lib/server/http';
import { criar, listar } from '@/lib/server/processos';
import { pessoaLogada } from '@/lib/server/sessao';

export const dynamic = 'force-dynamic';
const Novo = z.object({ nome: z.string().trim().min(1).max(200), area_id: z.string({ error: 'Escolha a área do processo.' }).uuid({ error: 'Escolha a área do processo.' }), descricao: z.string().trim().max(5000).optional() });

export const GET = (req: Request) => responder(() => listar(new URL(req.url).searchParams.get('arquivados') === '1'));
/** Quem cria fica guardado (decisão 149): a prévia antes de publicar só abre para essa pessoa. */
export const POST = (req: Request) => responder(async () => criar(Novo.parse(await req.json()), (await pessoaLogada())?.id ?? null));
