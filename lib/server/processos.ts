import 'server-only';
import { gerarCodigo } from '@/lib/codigo';
import type { ConteudoPop } from '@/lib/pop/schema';
import { garantir as garantirArea } from './areas';
import { ErroApi } from './http';
import { TENANT_PADRAO, supabase } from './supabase';

const CAMPOS = 'id, codigo, nome, descricao, area_id, criado_em, atualizado_em, area:areas(id, nome, organizacao:organizacoes(id, nome))';

export async function listar() {
  const { data, error } = await supabase().from('processos')
    .select(`${CAMPOS}, fluxogramas(count), gravacoes(count), pops(count)`)
    .eq('tenant_id', TENANT_PADRAO).order('atualizado_em', { ascending: false });
  if (error) throw error;
  const n = (x: unknown) => (x as { count: number }[])[0]?.count ?? 0;
  return data.map(({ fluxogramas, gravacoes, pops, ...p }) => ({ ...p, total: { fluxogramas: n(fluxogramas), gravacoes: n(gravacoes), pops: n(pops) } }));
}

export async function garantir(id: string) {
  const { data, error } = await supabase().from('processos').select('id, codigo, nome').eq('tenant_id', TENANT_PADRAO).eq('id', id).maybeSingle();
  if (error) throw error;
  if (!data) throw new ErroApi(404, 'Processo não encontrado');
  return data;
}

/** Marca o processo como mexido (sobe na lista). */
export async function tocar(id: string | null | undefined) {
  if (id) await supabase().from('processos').update({ atualizado_em: new Date().toISOString() }).eq('tenant_id', TENANT_PADRAO).eq('id', id);
}

export async function criar(d: { nome: string; area_id: string; descricao?: string }) {
  await garantirArea(d.area_id);
  for (let i = 0; i < 3; i++) {
    const { data, error } = await supabase().from('processos')
      .insert({ tenant_id: TENANT_PADRAO, codigo: gerarCodigo(), nome: d.nome, area_id: d.area_id, descricao: d.descricao ?? '' })
      .select(CAMPOS).single();
    if (!error) return data;
    if (error.code !== '23505') throw error;
  }
  throw new ErroApi(500, 'Não foi possível gerar um código único');
}

/** Tudo o que está dentro do processo. */
export async function obter(id: string) {
  const db = supabase();
  const [p, f, g, o] = await Promise.all([
    db.from('processos').select(CAMPOS).eq('tenant_id', TENANT_PADRAO).eq('id', id).maybeSingle(),
    db.from('fluxogramas').select('id, codigo, nome, origem, miniatura, atualizado_em').eq('tenant_id', TENANT_PADRAO).eq('processo_id', id).order('atualizado_em', { ascending: false }),
    db.from('gravacoes').select('id, nome, status, duracao_ms, processamento, criado_em, marcacoes:gravacao_marcacoes(count), segmentos:gravacao_segmentos(transcricao_status)')
      .eq('tenant_id', TENANT_PADRAO).eq('processo_id', id).order('criado_em', { ascending: false }),
    db.from('pops').select('id, nome, codigo, identificacao, versao, status, atualizado_em').eq('tenant_id', TENANT_PADRAO).eq('processo_id', id).order('atualizado_em', { ascending: false }),
  ]);
  for (const r of [p, f, g, o]) if (r.error) throw r.error;
  if (!p.data) throw new ErroApi(404, 'Processo não encontrado');
  return {
    ...p.data,
    fluxogramas: f.data ?? [],
    gravacoes: (g.data ?? []).map(({ marcacoes, segmentos, ...x }) => {
      const segs = segmentos as { transcricao_status: string }[];
      return { ...x, total_marcacoes: (marcacoes as { count: number }[])[0]?.count ?? 0, transcrita: segs.length > 0 && segs.every((s) => s.transcricao_status === 'pronta') };
    }),
    pops: o.data ?? [],
  };
}

/**
 * Campo "Área" do documento do POP ao mudar de área: acompanha a área nova se estava vazio ou com o
 * nome da área antiga; se a pessoa escreveu outra coisa, fica como está.
 */
export function areaDoDocumento(atual: string, antiga: string | null | undefined, nova: string) {
  const t = atual.trim().toLowerCase();
  return !t || (!!antiga && t === antiga.trim().toLowerCase()) ? nova : atual;
}

/** Atualiza o campo "Área" do documento dos POPs do processo (depois de o processo mudar de área). */
async function sincronizarAreaDosPops(processoId: string, antiga: string | null, nova: string) {
  const db = supabase();
  const { data, error } = await db.from('pops').select('id, conteudo').eq('tenant_id', TENANT_PADRAO).eq('processo_id', processoId);
  if (error) throw error;
  await Promise.all((data ?? []).map(async (p) => {
    const c = p.conteudo as ConteudoPop;
    const area = areaDoDocumento(c.area ?? '', antiga, nova);
    if (area === c.area) return;
    const { error: e } = await db.from('pops').update({ conteudo: { ...c, area }, atualizado_em: new Date().toISOString() }).eq('tenant_id', TENANT_PADRAO).eq('id', p.id);
    if (e) throw e;
  }));
}

export async function atualizar(id: string, dados: { nome?: string; area_id?: string; descricao?: string }) {
  const novaArea = dados.area_id ? await garantirArea(dados.area_id) : null;
  const db = supabase();
  const { data: antes, error: e1 } = await db.from('processos').select('area_id, area:areas(nome)').eq('tenant_id', TENANT_PADRAO).eq('id', id).maybeSingle();
  if (e1) throw e1;
  if (!antes) throw new ErroApi(404, 'Processo não encontrado');
  const { data, error } = await db.from('processos').update({ ...dados, atualizado_em: new Date().toISOString() })
    .eq('tenant_id', TENANT_PADRAO).eq('id', id).select('id').maybeSingle();
  if (error) throw error;
  if (!data) throw new ErroApi(404, 'Processo não encontrado');
  // Mudou de área: o campo "Área" dos POPs do processo acompanha.
  if (novaArea && antes.area_id !== novaArea.id) await sincronizarAreaDosPops(id, (antes.area as { nome?: string } | null)?.nome ?? null, novaArea.nome);
  return data;
}

/** Exclui só a pasta; os itens ficam sem processo (não se perde nada por engano). */
export async function excluir(id: string) {
  const { error } = await supabase().from('processos').delete().eq('tenant_id', TENANT_PADRAO).eq('id', id);
  if (error) throw error;
  return { ok: true };
}

/** Move um item para outro processo (ou para fora, com null). */
export async function mover(tabela: 'fluxogramas' | 'gravacoes' | 'pops', itemId: string, processoId: string | null) {
  if (processoId) await garantir(processoId);
  const { data, error } = await supabase().from(tabela).update({ processo_id: processoId }).eq('tenant_id', TENANT_PADRAO).eq('id', itemId).select('id').maybeSingle();
  if (error) throw error;
  if (!data) throw new ErroApi(404, 'Item não encontrado');
  await tocar(processoId);
  return data;
}
