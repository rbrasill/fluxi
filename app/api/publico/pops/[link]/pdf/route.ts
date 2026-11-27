import { baixar } from '@/lib/server/arquivo';
import { documentoPublico } from '@/lib/server/publicacao';

export const dynamic = 'force-dynamic';
/** PDF da versão publicada do POP. */
export async function GET(req: Request, { params }: { params: Promise<{ link: string }> }) {
  const { link } = await params;
  return baixar('pdf', () => documentoPublico(link, new URL(req.url).origin), { publico: true });
}
