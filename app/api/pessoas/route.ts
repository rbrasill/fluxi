import { responder } from '@/lib/server/http';
import { PessoaNovaSchema, criar, listar } from '@/lib/server/pessoas';
import { exigirAdmin } from '@/lib/server/sessao';

/** Pessoas e acessos: só administradores. */
export const GET = () => responder(async () => { await exigirAdmin(); return listar(); });
export const POST = (req: Request) => responder(async () => { await exigirAdmin(); return criar(PessoaNovaSchema.parse(await req.json())); });
