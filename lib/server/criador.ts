import 'server-only';
import { TENANT_PADRAO, supabase } from './supabase';

// Quem criou o POP ou o processo (decisão 149, migração 0034). Fica guardado ao criar e ao copiar. A prévia antes de
// publicar chegou a abrir só para essa pessoa; agora abre para todos os perfis (decisão 150).

type Tabela = 'pops' | 'processos';
type ErroDoBanco = { code?: string } | null | undefined;
/** O banco ainda sem a coluna `criado_por_id` (migração 0034 não aplicada): o app segue funcionando, sem o criador. */
export const semColunaDoCriador = (e: ErroDoBanco) => e?.code === '42703' || e?.code === 'PGRST204';

/** O id de quem criou; nulo no que foi criado antes de o criador ser guardado e não pôde ser deduzido. */
export async function criadorDe(tabela: Tabela, id: string): Promise<string | null> {
  const { data, error } = await supabase().from(tabela).select('criado_por_id').eq('tenant_id', TENANT_PADRAO).eq('id', id).maybeSingle();
  if (error) {
    if (semColunaDoCriador(error)) return null;
    throw error;
  }
  return ((data as { criado_por_id?: string | null } | null)?.criado_por_id) ?? null;
}
