import { responder } from '@/lib/server/http';
import { saldo } from '@/lib/server/creditos';

export const dynamic = 'force-dynamic';
export const GET = () => responder(async () => ({ creditos: await saldo() }));
