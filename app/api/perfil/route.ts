import { responder } from '@/lib/server/http';
import { PerfilAlteracaoSchema, alterar, obter } from '@/lib/server/perfil';
import { pessoaLogada } from '@/lib/server/sessao';

export const dynamic = 'force-dynamic';

/** Meu perfil (decisão 84): cada pessoa vê e muda só o próprio. */
export const GET = () => responder(async () => obter(await pessoaLogada()));
export const PATCH = (req: Request) => responder(async () => alterar(await pessoaLogada(), PerfilAlteracaoSchema.parse(await req.json())));
