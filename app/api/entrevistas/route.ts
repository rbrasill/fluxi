import { listar } from '@/lib/server/entrevistas';
import { responder } from '@/lib/server/http';
import { pessoaLogada } from '@/lib/server/sessao';

export const dynamic = 'force-dynamic';

/** As entrevistas da tela "Conversas com a Maia": as da pessoa logada; para gestores e administradores, todas (decisão 60). */
export const GET = () => responder(async () => listar(await pessoaLogada()));
