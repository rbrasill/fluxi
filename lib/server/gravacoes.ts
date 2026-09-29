import 'server-only';
import { ErroApi } from './http';
import { TENANT_PADRAO, supabase } from './supabase';

const BUCKET = 'gravacoes';
const URL_VALIDADE_S = 60 * 60 * 2;

const pasta = (gravacaoId: string) => `tenants/${TENANT_PADRAO}/gravacoes/${gravacaoId}/`;

function validarCaminho(gravacaoId: string, caminho: string) {
  if (!caminho.startsWith(pasta(gravacaoId)) || caminho.includes('..')) throw new ErroApi(400, 'Caminho de arquivo inválido');
}

async function garantirGravacao(id: string) {
  const { data, error } = await supabase().from('gravacoes').select('id').eq('tenant_id', TENANT_PADRAO).eq('id', id).maybeSingle();
  if (error) throw error;
  if (!data) throw new ErroApi(404, 'Gravação não encontrada');
}

export async function listar() {
  const { data, error } = await supabase()
    .from('gravacoes')
    .select('id, nome, status, duracao_ms, criado_em, marcacoes:gravacao_marcacoes(count)')
    .eq('tenant_id', TENANT_PADRAO)
    .order('criado_em', { ascending: false });
  if (error) throw error;
  return data.map(({ marcacoes, ...g }) => ({ ...g, total_marcacoes: (marcacoes as { count: number }[])[0]?.count ?? 0 }));
}

export async function criar(nome: string) {
  const { data, error } = await supabase().from('gravacoes').insert({ tenant_id: TENANT_PADRAO, nome }).select('id, nome, status').single();
  if (error) throw error;
  return data;
}

export async function atualizar(id: string, dados: { nome?: string; status?: string; duracao_ms?: number; largura?: number; altura?: number }) {
  const { data, error } = await supabase()
    .from('gravacoes').update({ ...dados, atualizado_em: new Date().toISOString() })
    .eq('tenant_id', TENANT_PADRAO).eq('id', id).select('id').maybeSingle();
  if (error) throw error;
  if (!data) throw new ErroApi(404, 'Gravação não encontrada');
  return data;
}

export async function urlDeUpload(id: string, tipo: 'segmento' | 'imagem', extensao: string) {
  await garantirGravacao(id);
  const ext = extensao.replace(/[^a-z0-9]/gi, '').slice(0, 5) || 'bin';
  const nome = tipo === 'segmento' ? `segmento-${crypto.randomUUID()}.${ext}` : `tela-${crypto.randomUUID()}.${ext}`;
  const caminho = pasta(id) + nome;
  const { data, error } = await supabase().storage.from(BUCKET).createSignedUploadUrl(caminho);
  if (error) throw error;
  return { caminho, url: data.signedUrl };
}

export async function registrarSegmento(id: string, s: { indice: number; caminho: string; inicio_ms: number; duracao_ms: number; bytes: number; mime: string }) {
  validarCaminho(id, s.caminho);
  const { error } = await supabase().from('gravacao_segmentos').upsert({ gravacao_id: id, tenant_id: TENANT_PADRAO, ...s });
  if (error) throw error;
  return { ok: true };
}

export async function criarMarcacao(id: string, m: { tempo_ms: number; imagem_caminho: string; instrucao?: string; largura?: number; altura?: number }) {
  validarCaminho(id, m.imagem_caminho);
  await garantirGravacao(id);
  const { data, error } = await supabase()
    .from('gravacao_marcacoes').insert({ tenant_id: TENANT_PADRAO, gravacao_id: id, ...m, instrucao: m.instrucao || null })
    .select('id').single();
  if (error) throw error;
  return data;
}

export async function atualizarMarcacao(id: string, marcacaoId: string, dados: { instrucao?: string | null; incluir_no_pop?: boolean }) {
  const { data, error } = await supabase()
    .from('gravacao_marcacoes').update({ ...dados, atualizado_em: new Date().toISOString() })
    .eq('tenant_id', TENANT_PADRAO).eq('gravacao_id', id).eq('id', marcacaoId).select('id').maybeSingle();
  if (error) throw error;
  if (!data) throw new ErroApi(404, 'Marcação não encontrada');
  return data;
}

export async function excluirMarcacao(id: string, marcacaoId: string) {
  const { data, error } = await supabase()
    .from('gravacao_marcacoes').delete()
    .eq('tenant_id', TENANT_PADRAO).eq('gravacao_id', id).eq('id', marcacaoId).select('imagem_caminho').maybeSingle();
  if (error) throw error;
  if (data) await supabase().storage.from(BUCKET).remove([data.imagem_caminho]);
  return { ok: true };
}

async function assinar(caminhos: string[]) {
  if (!caminhos.length) return new Map<string, string>();
  const { data, error } = await supabase().storage.from(BUCKET).createSignedUrls(caminhos, URL_VALIDADE_S);
  if (error) throw error;
  return new Map(data.filter((d) => d.signedUrl).map((d) => [d.path as string, d.signedUrl]));
}

export async function obter(id: string) {
  const db = supabase();
  const [g, segs, marcs] = await Promise.all([
    db.from('gravacoes').select('id, nome, status, duracao_ms, largura, altura, criado_em').eq('tenant_id', TENANT_PADRAO).eq('id', id).maybeSingle(),
    db.from('gravacao_segmentos').select('indice, caminho, inicio_ms, duracao_ms, bytes, mime').eq('tenant_id', TENANT_PADRAO).eq('gravacao_id', id).order('indice'),
    db.from('gravacao_marcacoes').select('id, tempo_ms, imagem_caminho, largura, altura, instrucao, instrucao_ia, incluir_no_pop').eq('tenant_id', TENANT_PADRAO).eq('gravacao_id', id).order('tempo_ms'),
  ]);
  for (const r of [g, segs, marcs]) if (r.error) throw r.error;
  if (!g.data) throw new ErroApi(404, 'Gravação não encontrada');
  const urls = await assinar([...(segs.data ?? []).map((s) => s.caminho), ...(marcs.data ?? []).map((m) => m.imagem_caminho)]);
  return {
    ...g.data,
    segmentos: (segs.data ?? []).map((s) => ({ ...s, url: urls.get(s.caminho) ?? null })),
    marcacoes: (marcs.data ?? []).map((m) => ({ ...m, imagem_url: urls.get(m.imagem_caminho) ?? null })),
  };
}

export async function excluir(id: string) {
  await garantirGravacao(id);
  const { data: arquivos } = await supabase().storage.from(BUCKET).list(pasta(id).slice(0, -1), { limit: 1000 });
  if (arquivos?.length) await supabase().storage.from(BUCKET).remove(arquivos.map((a) => pasta(id) + a.name));
  const { error } = await supabase().from('gravacoes').delete().eq('tenant_id', TENANT_PADRAO).eq('id', id);
  if (error) throw error;
  return { ok: true };
}
