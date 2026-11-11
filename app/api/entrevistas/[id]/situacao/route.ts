import { situacaoDaLigacao } from '@/lib/server/entrevistas';
import { responder } from '@/lib/server/http';

type Ctx = { params: Promise<{ id: string }> };
export const dynamic = 'force-dynamic';

/** Só a situação da entrevista, sem a conversa: as telas abertas percebem quando a ligação começa ou termina (decisão 69). */
export const GET = (_: Request, { params }: Ctx) => responder(async () => situacaoDaLigacao((await params).id));
