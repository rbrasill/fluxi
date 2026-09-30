import 'server-only';
import { gerarCodigo } from '@/lib/codigo';
import { ErroApi } from './http';
import { garantir as garantirProcesso, tocar } from './processos';
import { TENANT_PADRAO, supabase } from './supabase';

const RESUMO = 'id, codigo, nome, origem, miniatura, processo_id, criado_em, atualizado_em';

export type Origem = 'manual' | 'ia' | 'modelo';

export async function listar() {
  const { data, error } = await supabase()
    .from('fluxogramas').select(RESUMO).eq('tenant_id', TENANT_PADRAO).order('atualizado_em', { ascending: false });
  if (error) throw error;
  return data;
}

export async function obter(id: string) {
  const { data, error } = await supabase()
    .from('fluxogramas').select(`${RESUMO}, xml, schema`).eq('tenant_id', TENANT_PADRAO).eq('id', id).maybeSingle();
  if (error) throw error;
  if (!data) throw new ErroApi(404, 'Fluxograma não encontrado');
  return data;
}

export async function criar(dados: { nome: string; xml?: string; origem?: Origem; schema?: unknown; processo_id?: string | null }) {
  if (dados.processo_id) await garantirProcesso(dados.processo_id);
  // Tenta de novo em caso raro de código repetido.
  for (let i = 0; i < 3; i++) {
    const { data, error } = await supabase()
      .from('fluxogramas')
      .insert({ tenant_id: TENANT_PADRAO, codigo: gerarCodigo(), nome: dados.nome, xml: dados.xml ?? '', origem: dados.origem ?? 'manual', schema: dados.schema ?? null, processo_id: dados.processo_id ?? null })
      .select(RESUMO).single();
    if (!error) { await tocar(dados.processo_id); return data; }
    if (error.code !== '23505') throw error;
  }
  throw new ErroApi(500, 'Não foi possível gerar um código único');
}

export async function atualizar(id: string, dados: { nome?: string; xml?: string; miniatura?: string; processo_id?: string | null }) {
  if (dados.processo_id) await garantirProcesso(dados.processo_id);
  const { data, error } = await supabase()
    .from('fluxogramas').update({ ...dados, atualizado_em: new Date().toISOString() })
    .eq('tenant_id', TENANT_PADRAO).eq('id', id).select('id, atualizado_em').maybeSingle();
  if (error) throw error;
  if (!data) throw new ErroApi(404, 'Fluxograma não encontrado');
  return data;
}

export async function duplicar(id: string) {
  const f = await obter(id);
  return criar({ nome: `${f.nome} (cópia)`, xml: f.xml, origem: f.origem as Origem, schema: f.schema, processo_id: f.processo_id });
}

export async function excluir(id: string) {
  const { error } = await supabase().from('fluxogramas').delete().eq('tenant_id', TENANT_PADRAO).eq('id', id);
  if (error) throw error;
  return { ok: true };
}
