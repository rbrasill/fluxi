import { painel } from '@/lib/server/entrevistas';
import { responder } from '@/lib/server/http';
import { exigirAdmin } from '@/lib/server/sessao';

export const dynamic = 'force-dynamic';

/** Painel da Maia (decisão 52): como ela está configurada e as entrevistas com tempos, métricas e custos. Só administradores. */
export const GET = () => responder(async () => { await exigirAdmin(); return painel(); });
