import 'server-only';
import { ErroApi } from './http';
import { TENANT_PADRAO, supabase } from './supabase';

const CAMPOS = 'id, nome, descricao, criado_em, atualizado_em';

export async function listar() {
  const { data, error } = await supabase().from('areas').select(`${CAMPOS}, processos(count)`).eq('tenant_id', TENANT_PADRAO).order('nome');
  if (error) throw error;
  return data.map(({ processos, ...a }) => ({ ...a, total_processos: (processos as { count: number }[])[0]?.count ?? 0 }));
}

export async function garantir(id: string) {
  const { data, error } = await supabase().from('areas').select('id, nome').eq('tenant_id', TENANT_PADRAO).eq('id', id).maybeSingle();
  if (error) throw error;
  if (!data) throw new ErroApi(404, 'Área não encontrada');
  return data;
}

const duplicada = (e: { code?: string }) => {
  if (e.code === '23505') throw new ErroApi(409, 'Já existe uma área com esse nome.');
  throw e;
};

export async function criar(d: { nome: string; descricao?: string }) {
  const { data, error } = await supabase().from('areas').insert({ tenant_id: TENANT_PADRAO, nome: d.nome, descricao: d.descricao ?? '' }).select(CAMPOS).single();
  if (error) duplicada(error);
  return data!;
}

/** A área com os processos dela. */
export async function obter(id: string) {
  const db = supabase();
  const [a, p] = await Promise.all([
    db.from('areas').select(CAMPOS).eq('tenant_id', TENANT_PADRAO).eq('id', id).maybeSingle(),
    db.from('processos').select('id, codigo, nome, descricao, atualizado_em, fluxogramas(count), gravacoes(count), pops(count)')
      .eq('tenant_id', TENANT_PADRAO).eq('area_id', id).order('nome'),
  ]);
  for (const r of [a, p]) if (r.error) throw r.error;
  if (!a.data) throw new ErroApi(404, 'Área não encontrada');
  const n = (x: unknown) => (x as { count: number }[])[0]?.count ?? 0;
  return {
    ...a.data,
    processos: (p.data ?? []).map(({ fluxogramas, gravacoes, pops, ...x }) => ({ ...x, total: { fluxogramas: n(fluxogramas), gravacoes: n(gravacoes), pops: n(pops) } })),
  };
}

export async function atualizar(id: string, dados: { nome?: string; descricao?: string }) {
  const { data, error } = await supabase().from('areas').update({ ...dados, atualizado_em: new Date().toISOString() })
    .eq('tenant_id', TENANT_PADRAO).eq('id', id).select('id').maybeSingle();
  if (error) duplicada(error);
  if (!data) throw new ErroApi(404, 'Área não encontrada');
  return data;
}

/** Só exclui área vazia: os processos precisam ser movidos antes. */
export async function excluir(id: string) {
  const { count, error: e1 } = await supabase().from('processos').select('id', { count: 'exact', head: true }).eq('tenant_id', TENANT_PADRAO).eq('area_id', id);
  if (e1) throw e1;
  if (count) throw new ErroApi(409, `Esta área tem ${count} processo(s). Mova-os para outra área antes de excluir.`);
  const { error } = await supabase().from('areas').delete().eq('tenant_id', TENANT_PADRAO).eq('id', id);
  if (error) throw error;
  return { ok: true };
}
