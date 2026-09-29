import { responder } from '@/lib/server/http';
import { consultar } from '@/lib/server/transcricao';

export const dynamic = 'force-dynamic';
export const GET = (_: Request, { params }: { params: Promise<{ id: string }> }) => responder(async () => consultar((await params).id));
