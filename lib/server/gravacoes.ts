import 'server-only';
import type { Anotacoes } from '@/lib/marcacao/anotacoes';
import type { ConteudoPop } from '@/lib/pop/schema';
import { distribuirTelas } from '@/lib/gravacao/telas-preservadas';
import { ErroApi } from './http';
import { tocar } from './processos';
import { TENANT_PADRAO, supabase } from './supabase';
import * as telas from './telas';

const dono = (id: string): telas.Dono => ({ gravacao_id: id });

// Onde a gravação está (processo › área › organização), para o Início e as listas.
const ONDE = 'processo:processos(id, nome, arquivado_em, area:areas(id, nome, organizacao:organizacoes(id, nome))), pop:pops!pop_id(id, nome, arquivado_em)';

export type StatusGravacao = 'gravando' | 'pausada' | 'pronta' | 'interrompida' | 'erro';

export async function listar() {
  const { data, error } = await supabase()
    .from('gravacoes')
    .select(`id, nome, status, duracao_ms, processo_id, criado_em, atualizado_em, ${ONDE}, marcacoes:gravacao_marcacoes(count)`)
    .eq('tenant_id', TENANT_PADRAO)
    .order('criado_em', { ascending: false });
  if (error) throw error;
  type Dona = { id: string; nome: string; arquivado_em: string | null } | null;
  return data
    .filter((g) => !(g.processo as unknown as Dona)?.arquivado_em && !(g.pop as unknown as Dona)?.arquivado_em) // arquivados somem das listas
    .map(({ marcacoes, pop, ...g }) => {
      const p = pop as unknown as Dona;
      return { ...g, pop: p ? { id: p.id, nome: p.nome } : null, total_marcacoes: (marcacoes as { count: number }[])[0]?.count ?? 0 };
    });
}

/** A gravação nasce dentro de um POP (decisão 31) e herda o processo dele. */
export async function criar(nome: string, popId: string) {
  const { data: pop, error: e1 } = await supabase().from('pops').select('id, processo_id, arquivado_em, processo:processos(arquivado_em)').eq('tenant_id', TENANT_PADRAO).eq('id', popId).maybeSingle();
  if (e1) throw e1;
  if (!pop) throw new ErroApi(404, 'POP não encontrado');
  if (pop.arquivado_em || (pop.processo as unknown as { arquivado_em: string | null } | null)?.arquivado_em) throw new ErroApi(409, 'O POP está arquivado: restaure-o antes de gravar.');
  const { data, error } = await supabase().from('gravacoes').insert({ tenant_id: TENANT_PADRAO, nome, pop_id: popId, processo_id: pop.processo_id }).select('id, nome, status').single();
  if (error) throw error;
  await tocar(pop.processo_id);
  return data;
}

export async function atualizar(id: string, dados: { nome?: string; status?: StatusGravacao; duracao_ms?: number; largura?: number; altura?: number }) {
  const { data, error } = await supabase()
    .from('gravacoes').update({ ...dados, atualizado_em: new Date().toISOString() })
    .eq('tenant_id', TENANT_PADRAO).eq('id', id).select('id').maybeSingle();
  if (error) throw error;
  if (!data) throw new ErroApi(404, 'Gravação não encontrada');
  return data;
}

export const urlDeUpload = (id: string, tipo: 'segmento' | 'imagem', extensao: string) => telas.urlDeUpload(dono(id), tipo, extensao);

export async function registrarSegmento(id: string, s: { indice: number; caminho: string; inicio_ms: number; duracao_ms: number; bytes: number; mime: string }) {
  telas.validarCaminho(dono(id), s.caminho);
  const { error } = await supabase().from('gravacao_segmentos').upsert({ gravacao_id: id, tenant_id: TENANT_PADRAO, ...s });
  if (error) throw error;
  return { ok: true };
}

export const criarMarcacao = (id: string, m: { tempo_ms: number; imagem_caminho: string; instrucao?: string; largura?: number; altura?: number }) => telas.criar(dono(id), m);
export const atualizarMarcacao = (id: string, marcacaoId: string, dados: { instrucao?: string | null; incluir_no_pop?: boolean }) => telas.atualizar(dono(id), marcacaoId, dados);
export const salvarAnotacao = (id: string, marcacaoId: string, a: { anotacoes: Anotacoes; imagem_anotada_caminho: string; largura: number; altura: number } | null) =>
  telas.salvarAnotacao(dono(id), marcacaoId, a);
export const excluirMarcacao = (id: string, marcacaoId: string) => telas.excluir(dono(id), marcacaoId);

/** O POP dono da gravação e as telas dele que já estão no conteúdo. */
async function popDaGravacao(id: string, popId: string | null) {
  const { data, error } = await supabase().from('pops').select('id, nome, status, conteudo')
    .eq('tenant_id', TENANT_PADRAO).or(`gravacao_id.eq.${id}${popId ? `,id.eq.${popId}` : ''}`)
    .order('atualizado_em', { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const c = data.conteudo as ConteudoPop;
  return { id: data.id as string, nome: data.nome as string, status: data.status as string, telas: c.procedimentos.flatMap((p) => p.passos.map((s) => s.marcacao_id)).filter(Boolean) as string[] };
}

export async function obter(id: string) {
  const db = supabase();
  const [g, segs, marcs] = await Promise.all([
    db.from('gravacoes').select('id, nome, status, duracao_ms, largura, altura, processo_id, processamento, pop_id, criado_em, processo:processos(id, nome, codigo)').eq('tenant_id', TENANT_PADRAO).eq('id', id).maybeSingle(),
    db.from('gravacao_segmentos').select('indice, caminho, inicio_ms, duracao_ms, bytes, mime').eq('tenant_id', TENANT_PADRAO).eq('gravacao_id', id).order('indice'),
    db.from('gravacao_marcacoes').select('id, tempo_ms, imagem_caminho, largura, altura, instrucao, instrucao_ia, incluir_no_pop, anotacoes, imagem_anotada_caminho, anotada_largura, anotada_altura').eq('tenant_id', TENANT_PADRAO).eq('gravacao_id', id).order('tempo_ms'),
  ]);
  for (const r of [g, segs, marcs]) if (r.error) throw r.error;
  if (!g.data) throw new ErroApi(404, 'Gravação não encontrada');
  const [urls, pop] = await Promise.all([
    telas.assinar([
      ...(segs.data ?? []).map((s) => s.caminho),
      ...(marcs.data ?? []).flatMap((m) => [m.imagem_caminho, m.imagem_anotada_caminho].filter(Boolean) as string[]),
    ]),
    popDaGravacao(id, g.data.pop_id as string | null),
  ]);
  const { pop_id: _p, ...dados } = g.data;
  return {
    ...dados,
    pop,
    segmentos: (segs.data ?? []).map((s) => ({ ...s, url: urls.get(s.caminho) ?? null })),
    marcacoes: (marcs.data ?? []).map((m) => ({
      ...m,
      imagem_url: urls.get(m.imagem_caminho) ?? null,
      imagem_anotada_url: m.imagem_anotada_caminho ? urls.get(m.imagem_anotada_caminho) ?? null : null,
    })),
  };
}

/**
 * Exclui a gravação para sempre: o vídeo e as telas marcadas. As telas que já estão nos passos de
 * um POP não se perdem: passam a ser do POP (como um print anexado), e o arquivo delas fica onde
 * está. `preservarTelas: false` quando o próprio POP ou o processo está sendo excluído.
 */
export async function excluir(id: string, { preservarTelas = true }: { preservarTelas?: boolean } = {}) {
  const db = supabase();
  const { data: g, error: e0 } = await db.from('gravacoes').select('id, pop_id, processo_id').eq('tenant_id', TENANT_PADRAO).eq('id', id).maybeSingle();
  if (e0) throw e0;
  if (!g) throw new ErroApi(404, 'Gravação não encontrada');

  const manter = new Set<string>(); // arquivos das telas que ficam no POP
  let telasMantidas = 0;
  if (preservarTelas) {
    const { data: marcs, error: e1 } = await db.from('gravacao_marcacoes').select('id, imagem_caminho, imagem_anotada_caminho')
      .eq('tenant_id', TENANT_PADRAO).eq('gravacao_id', id);
    if (e1) throw e1;
    const daGravacao = new Map((marcs ?? []).map((m) => [m.id as string, m]));
    if (daGravacao.size && (g.pop_id || g.processo_id)) {
      // POPs que podem usar as telas: o da gravação primeiro, depois os do mesmo processo.
      let q = db.from('pops').select('id, conteudo').eq('tenant_id', TENANT_PADRAO);
      q = g.processo_id ? q.or(`processo_id.eq.${g.processo_id}${g.pop_id ? `,id.eq.${g.pop_id}` : ''}`) : q.eq('id', g.pop_id as string);
      const { data: pops, error: e2 } = await q;
      if (e2) throw e2;
      const { paraPop, usadas } = distribuirTelas(new Set(daGravacao.keys()), (pops ?? []) as { id: string; conteudo: ConteudoPop | null }[], g.pop_id as string | null);
      for (const [popId, ids] of paraPop) {
        const { error } = await db.from('gravacao_marcacoes').update({ gravacao_id: null, pop_id: popId, atualizado_em: new Date().toISOString() })
          .eq('tenant_id', TENANT_PADRAO).in('id', ids);
        if (error) throw error;
      }
      telasMantidas = usadas.size;
      for (const mid of usadas) {
        const m = daGravacao.get(mid)!;
        for (const c of [m.imagem_caminho, m.imagem_anotada_caminho]) if (c) manter.add(c as string);
      }
      // Por garantia: nenhum arquivo que um passo mostra é apagado, mesmo sem a tela registrada.
      const prefixo = telas.pastaDe(dono(id));
      for (const o of pops ?? []) for (const p of (o.conteudo as ConteudoPop | null)?.procedimentos ?? []) for (const s of p.passos) {
        if (s.imagem_caminho?.startsWith(prefixo)) manter.add(s.imagem_caminho);
      }
    }
  }

  // Apaga os arquivos da gravação (vídeo e telas), menos os das telas que passaram para o POP.
  const pasta = telas.pastaDe(dono(id)).slice(0, -1);
  const { data: arquivos } = await db.storage.from(telas.BUCKET).list(pasta, { limit: 1000 });
  const apagar = (arquivos ?? []).map((a) => `${pasta}/${a.name}`).filter((c) => !manter.has(c));
  if (apagar.length) await db.storage.from(telas.BUCKET).remove(apagar);
  // A linha da gravação leva junto as partes do vídeo e as telas que ficaram com ela.
  const { error } = await db.from('gravacoes').delete().eq('tenant_id', TENANT_PADRAO).eq('id', id);
  if (error) throw error;
  if (g.processo_id) await tocar(g.processo_id as string).catch(() => {});
  return { ok: true, telas_mantidas: telasMantidas };
}
