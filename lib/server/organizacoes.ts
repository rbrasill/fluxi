import 'server-only';
import { ErroApi } from './http';
import { TENANT_PADRAO, supabase } from './supabase';

const CAMPOS = 'id, nome, criado_em, atualizado_em';

export async function listar() {
  const { data, error } = await supabase().from('organizacoes').select(`${CAMPOS}, areas(count)`).eq('tenant_id', TENANT_PADRAO).order('nome');
  if (error) throw error;
  return data.map(({ areas, ...o }) => ({ ...o, total_areas: (areas as { count: number }[])[0]?.count ?? 0 }));
}

export async function garantir(id: string) {
  const { data, error } = await supabase().from('organizacoes').select('id, nome').eq('tenant_id', TENANT_PADRAO).eq('id', id).maybeSingle();
  if (error) throw error;
  if (!data) throw new ErroApi(404, 'Organização não encontrada');
  return data;
}

const duplicada = (e: { code?: string }) => {
  if (e.code === '23505') throw new ErroApi(409, 'Já existe uma organização com esse nome.');
  throw e;
};

export async function criar(d: { nome: string }) {
  const { data, error } = await supabase().from('organizacoes').insert({ tenant_id: TENANT_PADRAO, nome: d.nome }).select(CAMPOS).single();
  if (error) duplicada(error);
  return data!;
}

/** A organização com as áreas dela. */
export async function obter(id: string) {
  const db = supabase();
  const [o, a] = await Promise.all([
    db.from('organizacoes').select(CAMPOS).eq('tenant_id', TENANT_PADRAO).eq('id', id).maybeSingle(),
    db.from('areas').select('id, nome, descricao, processos(count)').eq('tenant_id', TENANT_PADRAO).eq('organizacao_id', id).order('nome'),
  ]);
  for (const r of [o, a]) if (r.error) throw r.error;
  if (!o.data) throw new ErroApi(404, 'Organização não encontrada');
  return {
    ...o.data,
    areas: (a.data ?? []).map(({ processos, ...x }) => ({ ...x, total_processos: (processos as { count: number }[])[0]?.count ?? 0 })),
  };
}

export async function atualizar(id: string, dados: { nome?: string }) {
  const { data, error } = await supabase().from('organizacoes').update({ ...dados, atualizado_em: new Date().toISOString() })
    .eq('tenant_id', TENANT_PADRAO).eq('id', id).select('id').maybeSingle();
  if (error) duplicada(error);
  if (!data) throw new ErroApi(404, 'Organização não encontrada');
  return data;
}

/** Só exclui organização sem áreas. */
export async function excluir(id: string) {
  const { count, error: e1 } = await supabase().from('areas').select('id', { count: 'exact', head: true }).eq('tenant_id', TENANT_PADRAO).eq('organizacao_id', id);
  if (e1) throw e1;
  if (count) throw new ErroApi(409, `Esta organização tem ${count} área(s). Exclua ou mova as áreas antes.`);
  const { error } = await supabase().from('organizacoes').delete().eq('tenant_id', TENANT_PADRAO).eq('id', id);
  if (error) throw error;
  return { ok: true };
}
