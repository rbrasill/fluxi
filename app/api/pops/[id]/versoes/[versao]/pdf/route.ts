import { baixar } from '@/lib/server/arquivo';
import { documentoDaVersao } from '@/lib/server/publicacao';

export const dynamic = 'force-dynamic';

/** O PDF de uma versão publicada do POP (decisão 138). */
export async function GET(req: Request, { params }: { params: Promise<{ id: string; versao: string }> }) {
  const { id, versao } = await params;
  return baixar('pdf', () => documentoDaVersao(id, versao, new URL(req.url).origin));
}
