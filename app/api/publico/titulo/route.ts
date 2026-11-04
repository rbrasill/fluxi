import { responder } from '@/lib/server/http';
import { tituloPublico } from '@/lib/server/publicacao';

/** Título e endereço do documento de origem (?de=p:<link> ou pr:<link>), para o "Voltar para…" das páginas públicas. */
export const dynamic = 'force-dynamic';
export const GET = (req: Request) => responder(async () => tituloPublico(new URL(req.url).searchParams.get('de')));
