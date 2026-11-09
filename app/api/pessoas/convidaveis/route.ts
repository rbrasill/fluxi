import { responder } from '@/lib/server/http';
import { convidaveis } from '@/lib/server/pessoas';
import { exigirGestor } from '@/lib/server/sessao';

export const dynamic = 'force-dynamic';

/** Quem pode ser convidado para uma entrevista com a Maia (nome e e-mail): gestores e administradores. */
export const GET = () => responder(async () => { await exigirGestor(); return convidaveis(); });
