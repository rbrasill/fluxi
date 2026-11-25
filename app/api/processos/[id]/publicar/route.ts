import { responder } from '@/lib/server/http';
import { publicarProcesso } from '@/lib/server/publicacao';

export const dynamic = 'force-dynamic';
/** Publica o processo como está agora (decisão 129): a página pública passa a mostrar esta versão. */
export const POST = (_: Request, { params }: { params: Promise<{ id: string }> }) =>
  responder(async () => publicarProcesso((await params).id));
