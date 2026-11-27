import { responderPublico } from '@/lib/server/http';
import { abrirArquivoPublico } from '@/lib/server/publicacao';

export const dynamic = 'force-dynamic';

/** Abre um arquivo pela página pública do POP: só os da versão publicada, com a página no ar, e que não expiraram. */
export const GET = (_req: Request, { params }: { params: Promise<{ link: string; arquivoId: string }> }) =>
  responderPublico(async () => { const p = await params; return abrirArquivoPublico(p.link, p.arquivoId); }, { semCache: true });
