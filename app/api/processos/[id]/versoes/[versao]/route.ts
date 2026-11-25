import { responder } from '@/lib/server/http';
import { versaoDoProcesso } from '@/lib/server/publicacao';

export const dynamic = 'force-dynamic';
/** Uma versão publicada do processo, como saiu naquele dia, só para leitura (decisão 139). */
export const GET = (_: Request, { params }: { params: Promise<{ id: string; versao: string }> }) =>
  responder(async () => { const { id, versao } = await params; return versaoDoProcesso(id, versao); });
