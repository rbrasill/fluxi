import { responder } from '@/lib/server/http';
import { duplicar } from '@/lib/server/fluxogramas';

export const POST = (_: Request, { params }: { params: Promise<{ id: string }> }) => responder(async () => duplicar((await params).id));
