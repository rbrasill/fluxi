import { baixar } from '@/lib/server/arquivo';
import { documentoPublico } from '@/lib/server/publicacao';

export const dynamic = 'force-dynamic';
/** DOCX da versão publicada do POP. */
export async function GET(req: Request, { params }: { params: Promise<{ link: string }> }) {
  const { link } = await params;
  return baixar('docx', () => documentoPublico(link, 'docx', new URL(req.url).origin));
}
