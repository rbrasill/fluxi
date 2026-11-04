import 'server-only';
import { gerarCodigo } from '@/lib/codigo';
import { ErroApi } from './http';
import { garantir as garantirProcesso, tocar } from './processos';
import { TENANT_PADRAO, supabase } from './supabase';

const RESUMO = 'id, codigo, nome, origem, miniatura, processo_id, link_publico, tem_svg, criado_em, atualizado_em';

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

/** As imagens geradas pelo editor (miniatura e SVG publicado), para a cópia de processo (decisão 36). */
export async function imagensDe(id: string) {
  const { data, error } = await supabase().from('fluxogramas').select('miniatura, svg').eq('tenant_id', TENANT_PADRAO).eq('id', id).maybeSingle();
  if (error) throw error;
  return { miniatura: (data?.miniatura as string | null) ?? null, svg: (data?.svg as string | null) ?? null };
}

/** O fluxograma do processo (um por processo, decisão 31), se já existe. */
export async function doProcesso(processoId: string) {
  const { data, error } = await supabase().from('fluxogramas').select(RESUMO).eq('tenant_id', TENANT_PADRAO).eq('processo_id', processoId).maybeSingle();
  if (error) throw error;
  return data;
}

/**
 * Cria o fluxograma. Num processo que já tem o dele, só com `substituir`: o desenho atual é trocado
 * (mesmo id e código, para os links continuarem valendo).
 */
export async function criar(dados: { nome: string; xml?: string; origem?: Origem; schema?: unknown; processo_id?: string | null; substituir?: boolean }) {
  if (dados.processo_id) {
    const processo = await garantirProcesso(dados.processo_id);
    const atual = await doProcesso(dados.processo_id);
    if (atual && !dados.substituir) throw new ErroApi(409, 'Este processo já tem fluxograma. Abra o fluxograma para editar ou gere de novo com IA para substituir.');
    if (atual) {
      // O SVG publicado era do desenho antigo: o editor gera o novo ao abrir (e a IA já abre o editor).
      await atualizar(atual.id, { nome: dados.nome, xml: dados.xml ?? '', origem: dados.origem ?? 'manual', schema: dados.schema ?? null, miniatura: null, svg: null });
      return { ...atual, nome: dados.nome, origem: dados.origem ?? 'manual', tem_svg: false };
    }
    // O código do fluxograma é o do processo: é "o fluxograma do processo X".
    return inserir({ ...dados, codigo: processo.codigo });
  }
  // Tenta de novo em caso raro de código repetido.
  for (let i = 0; i < 3; i++) {
    try { return await inserir({ ...dados, codigo: gerarCodigo() }); } catch (e) { if ((e as { code?: string }).code !== '23505') throw e; }
  }
  throw new ErroApi(500, 'Não foi possível gerar um código único');
}

async function inserir(dados: { nome: string; xml?: string; origem?: Origem; schema?: unknown; processo_id?: string | null; codigo: string }) {
  const { data, error } = await supabase()
    .from('fluxogramas')
    .insert({ tenant_id: TENANT_PADRAO, codigo: dados.codigo, nome: dados.nome, xml: dados.xml ?? '', origem: dados.origem ?? 'manual', schema: dados.schema ?? null, processo_id: dados.processo_id ?? null })
    .select(RESUMO).single();
  if (error) throw error;
  await tocar(dados.processo_id);
  return data;
}

export async function atualizar(id: string, dados: { nome?: string; xml?: string; miniatura?: string | null; svg?: string | null; origem?: Origem; schema?: unknown; processo_id?: string | null }) {
  if (dados.processo_id) await garantirProcesso(dados.processo_id);
  // Miniatura e SVG são gerados pelo editor a partir do desenho: não contam como alteração.
  const soImagens = Object.keys(dados).every((k) => k === 'miniatura' || k === 'svg');
  const { data, error } = await supabase()
    .from('fluxogramas').update(soImagens ? dados : { ...dados, atualizado_em: new Date().toISOString() })
    .eq('tenant_id', TENANT_PADRAO).eq('id', id).select('id, atualizado_em').maybeSingle();
  if (error) throw error;
  if (!data) throw new ErroApi(404, 'Fluxograma não encontrado');
  return data;
}

export async function excluir(id: string) {
  const { error } = await supabase().from('fluxogramas').delete().eq('tenant_id', TENANT_PADRAO).eq('id', id);
  if (error) throw error;
  return { ok: true };
}
