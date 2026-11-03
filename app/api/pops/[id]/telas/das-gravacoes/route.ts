import { responder } from '@/lib/server/http';
import { telasDasGravacoes } from '@/lib/server/pops';

export const dynamic = 'force-dynamic';
/** Telas marcadas em todas as gravações do POP, para escolher o print de um passo. */
export const GET = (_: Request, { params }: { params: Promise<{ id: string }> }) => responder(async () => telasDasGravacoes((await params).id));
