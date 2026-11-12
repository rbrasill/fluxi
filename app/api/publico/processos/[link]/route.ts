import { responderPublico } from '@/lib/server/http';
import { processoPublico } from '@/lib/server/publicacao';

/** Página pública do processo (decisão 35): descrição, fluxograma e os POPs publicados. */
export const dynamic = 'force-dynamic';
export const GET = (_: Request, { params }: { params: Promise<{ link: string }> }) => responderPublico(async () => processoPublico((await params).link));
