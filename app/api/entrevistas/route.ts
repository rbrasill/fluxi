import { listar } from '@/lib/server/entrevistas';
import { responder } from '@/lib/server/http';

export const dynamic = 'force-dynamic';

/** Todas as entrevistas, da mais recente para a mais antiga. Entrevistas novas nascem por convite, a partir do processo (decisão 53). */
export const GET = () => responder(listar);
