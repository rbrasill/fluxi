import { responder } from '@/lib/server/http';
import { versaoDoPop } from '@/lib/server/publicacao';

export const dynamic = 'force-dynamic';
/** Uma versão publicada do POP, como saiu naquele dia, só para leitura (decisão 138). */
export const GET = (_: Request, { params }: { params: Promise<{ id: string; versao: string }> }) =>
  responder(async () => { const { id, versao } = await params; return versaoDoPop(id, versao); });
