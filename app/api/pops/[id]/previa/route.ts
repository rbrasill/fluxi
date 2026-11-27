import { responder } from '@/lib/server/http';
import { previaDoPop } from '@/lib/server/previa';

export const dynamic = 'force-dynamic';
/** A prévia do POP antes de publicar (decisões 149 e 150): para qualquer pessoa logada. */
export const GET = (_: Request, { params }: { params: Promise<{ id: string }> }) =>
  responder(async () => previaDoPop((await params).id));
