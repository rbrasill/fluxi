import { responder } from '@/lib/server/http';
import { previaDoProcesso } from '@/lib/server/previa';

export const dynamic = 'force-dynamic';
/** A prévia do processo antes de publicar (decisões 149 e 150): para qualquer pessoa logada. */
export const GET = (_: Request, { params }: { params: Promise<{ id: string }> }) =>
  responder(async () => previaDoProcesso((await params).id));
