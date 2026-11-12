import { responderPublico } from '@/lib/server/http';
import { popPublico } from '@/lib/server/publicacao';

export const dynamic = 'force-dynamic';
/** Versão publicada do POP, para a página pública (link aberto para quem o tiver, decisão 32). */
export const GET = (_: Request, { params }: { params: Promise<{ link: string }> }) => responderPublico(async () => popPublico((await params).link));
