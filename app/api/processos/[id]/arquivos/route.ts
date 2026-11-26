import { doProcesso } from '@/lib/server/anexos';
import { responder } from '@/lib/server/http';

export const dynamic = 'force-dynamic';

/** A central de arquivos do processo (decisão 141): os arquivos dos POPs dele, com as etapas em que estão. */
export const GET = (_req: Request, { params }: { params: Promise<{ id: string }> }) =>
  responder(async () => doProcesso((await params).id));
