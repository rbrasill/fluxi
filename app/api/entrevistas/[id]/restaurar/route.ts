import { restaurar } from '@/lib/server/entrevistas';
import { responder } from '@/lib/server/http';
import { exigirGestor } from '@/lib/server/sessao';

type Ctx = { params: Promise<{ id: string }> };

/** Devolve a entrevista arquivada à lista de ativas do processo (decisão 72). Gestores e administradores. */
export const POST = (_: Request, { params }: Ctx) => responder(async () => { await exigirGestor(); return restaurar((await params).id); });
