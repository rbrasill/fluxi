import { responder } from '@/lib/server/http';
import { buscar } from '@/lib/server/referencias';
import { ehTipo } from '@/lib/referencias';

/** Busca de POPs e processos para inserir uma referência (decisão 35). ?q=texto&excluir=pop:<id> */
export const dynamic = 'force-dynamic';
export const GET = (req: Request) => responder(async () => {
  const u = new URL(req.url);
  const q = (u.searchParams.get('q') ?? '').slice(0, 100);
  const m = u.searchParams.get('excluir')?.match(/^(pop|processo):([0-9a-f-]{36})$/i);
  const excluir = m && ehTipo(m[1]) ? { tipo: m[1], id: m[2].toLowerCase() } : null;
  return buscar(q, excluir);
});
