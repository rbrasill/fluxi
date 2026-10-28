import 'server-only';
import type { Anotacoes } from '@/lib/marcacao/anotacoes';
import type { ConteudoPop } from '@/lib/pop/schema';
import { ErroApi } from './http';
import { garantir as garantirProcesso, tocar } from './processos';
import { TENANT_PADRAO, supabase } from './supabase';
import * as telas from './telas';

const dono = (id: string): telas.Dono => ({ gravacao_id: id });

// Onde a gravação está (processo › área › organização), para o Início e as listas.
const ONDE = 'processo:processos(id, nome, area:areas(id, nome, organizacao:organizacoes(id, nome)))';

export type StatusGravacao = 'gravando' | 'pausada' | 'pronta' | 'interrompida' | 'erro';

export async function listar() {
  const { data, error } = await supabase()
    .from('gravacoes')
    .select(`id, nome, status, duracao_ms, processo_id, criado_em, atualizado_em, ${ONDE}, marcacoes:gravacao_marcacoes(count)`)
    .eq('tenant_id', TENANT_PADRAO)
    .order('criado_em', { ascending: false });
  if (error) throw error;
  return data.map(({ marcacoes, ...g }) => ({ ...g, total_marcacoes: (marcacoes as { count: number }[])[0]?.count ?? 0 }));
}

export async function criar(nome: string, processoId?: string) {
  if (processoId) await garantirProcesso(processoId);
  const { data, error } = await supabase().from('gravacoes').insert({ tenant_id: TENANT_PADRAO, nome, processo_id: processoId ?? null }).select('id, nome, status').single();
  if (error) throw error;
  await tocar(processoId);
  return data;
}

export async function atualizar(id: string, dados: { nome?: string; status?: StatusGravacao; duracao_ms?: number; largura?: number; altura?: number; processo_id?: string | null }) {
  if (dados.processo_id) await garantirProcesso(dados.processo_id);
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

/** POP ligado à gravação (gerado pela IA ou criado "com estas telas") e as telas que ele já usa. */
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
    db.from('gravacao_segmentos').select('indice, caminho, inicio_ms, duracao_ms, bytes, mime, falas').eq('tenant_id', TENANT_PADRAO).eq('gravacao_id', id).order('indice'),
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
    segmentos: (segs.data ?? []).map(({ falas: _f, ...s }) => ({ ...s, url: urls.get(s.caminho) ?? null })),
    // Transcrição da narração (quando já foi feita), com o tempo da gravação inteira.
    falas: (segs.data ?? []).flatMap((s) => (s.falas as { falante: string; inicio_ms: number; texto: string }[] | null) ?? []),
    marcacoes: (marcs.data ?? []).map((m) => ({
      ...m,
      imagem_url: urls.get(m.imagem_caminho) ?? null,
      imagem_anotada_url: m.imagem_anotada_caminho ? urls.get(m.imagem_anotada_caminho) ?? null : null,
    })),
  };
}

export async function excluir(id: string) {
  await telas.garantirDono(dono(id));
  await telas.removerPasta(dono(id));
  const { error } = await supabase().from('gravacoes').delete().eq('tenant_id', TENANT_PADRAO).eq('id', id);
  if (error) throw error;
  return { ok: true };
}
