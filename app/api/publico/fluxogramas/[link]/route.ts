import { responderPublico } from '@/lib/server/http';
import { fluxogramaPublico } from '@/lib/server/publicacao';

export const dynamic = 'force-dynamic';
/** Dados da página pública "só o fluxograma". */
export const GET = (_: Request, { params }: { params: Promise<{ link: string }> }) => responderPublico(async () => fluxogramaPublico((await params).link));
