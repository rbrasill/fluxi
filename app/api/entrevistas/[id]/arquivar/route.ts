import { arquivar } from '@/lib/server/entrevistas';
import { responder } from '@/lib/server/http';
import { exigirGestor } from '@/lib/server/sessao';

type Ctx = { params: Promise<{ id: string }> };

/** Arquiva a entrevista (decisão 72): sai do fluxo do processo e fica guardada em Arquivadas. Gestores e administradores. */
export const POST = (_: Request, { params }: Ctx) => responder(async () => arquivar((await params).id, await exigirGestor()));
