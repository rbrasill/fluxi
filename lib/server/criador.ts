import 'server-only';
import { ErroApi } from './http';
import type { Pessoa } from './login';
import { TENANT_PADRAO, supabase } from './supabase';

// Quem criou o POP ou o processo (decisão 149, migração 0034). A prévia antes de publicar só abre para essa pessoa:
// o que não foi publicado não pode circular com cara de documento oficial.

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

/**
 * Só quem criou vê a prévia. Sem criador guardado (criado antes da decisão 149), só os administradores, para o
 * documento não ficar sem prévia para ninguém. Sem login configurado (desenvolvimento), está aberto.
 */
export const podeVerPrevia = (criadorId: string | null, pessoa: Pick<Pessoa, 'id' | 'nivel'> | null) =>
  !pessoa || (criadorId ? criadorId === pessoa.id : pessoa.nivel === 'admin');

export const podeVer = async (tabela: Tabela, id: string, pessoa: Pick<Pessoa, 'id' | 'nivel'> | null) => podeVerPrevia(await criadorDe(tabela, id), pessoa);

export async function exigirCriador(tabela: Tabela, id: string, pessoa: Pick<Pessoa, 'id' | 'nivel'> | null) {
  if (!(await podeVer(tabela, id, pessoa))) {
    throw new ErroApi(403, `Só quem criou este ${tabela === 'pops' ? 'POP' : 'processo'} pode ver a prévia.`, 'previa_restrita');
  }
}
