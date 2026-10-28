import 'server-only';
import type { Anotacoes } from '@/lib/marcacao/anotacoes';
import { ErroApi } from './http';
import { TENANT_PADRAO, supabase } from './supabase';

// Telas (prints) que ilustram os passos do POP. Uma tela pertence a uma gravação (marcada
// durante a gravação, com o tempo) ou a um POP (anexada depois, no editor). As duas ficam na
// tabela gravacao_marcacoes; o que muda é o dono e a pasta do arquivo no Storage.

export const BUCKET = 'gravacoes';
const URL_VALIDADE_S = 60 * 60 * 2;

export type Dono = { gravacao_id: string } | { pop_id: string };

export const pastaDe = (d: Dono) =>
  'gravacao_id' in d ? `tenants/${TENANT_PADRAO}/gravacoes/${d.gravacao_id}/` : `tenants/${TENANT_PADRAO}/pops/${d.pop_id}/`;

export function validarCaminho(d: Dono, caminho: string) {
  if (!caminho.startsWith(pastaDe(d)) || caminho.includes('..')) throw new ErroApi(400, 'Caminho de arquivo inválido');
}

export async function garantirDono(d: Dono) {
  const tabela = 'gravacao_id' in d ? 'gravacoes' : 'pops';
  const id = 'gravacao_id' in d ? d.gravacao_id : d.pop_id;
  const { data, error } = await supabase().from(tabela).select('id').eq('tenant_id', TENANT_PADRAO).eq('id', id).maybeSingle();
  if (error) throw error;
  if (!data) throw new ErroApi(404, tabela === 'pops' ? 'POP não encontrado' : 'Gravação não encontrada');
}

/** URL assinada para o navegador enviar o arquivo direto ao Storage. */
export async function urlDeUpload(d: Dono, tipo: 'segmento' | 'imagem', extensao: string) {
  await garantirDono(d);
  const ext = extensao.replace(/[^a-z0-9]/gi, '').slice(0, 5) || 'bin';
  const caminho = pastaDe(d) + (tipo === 'segmento' ? `segmento-${crypto.randomUUID()}.${ext}` : `tela-${crypto.randomUUID()}.${ext}`);
  const { data, error } = await supabase().storage.from(BUCKET).createSignedUploadUrl(caminho);
  if (error) throw error;
  return { caminho, url: data.signedUrl };
}

export async function criar(d: Dono, m: { tempo_ms?: number; imagem_caminho: string; instrucao?: string; largura?: number; altura?: number }) {
  validarCaminho(d, m.imagem_caminho);
  await garantirDono(d);
  const { data, error } = await supabase()
    .from('gravacao_marcacoes').insert({ tenant_id: TENANT_PADRAO, ...d, ...m, tempo_ms: m.tempo_ms ?? null, instrucao: m.instrucao || null })
    .select('id').single();
  if (error) throw error;
  return data;
}

export async function atualizar(d: Dono, telaId: string, dados: { instrucao?: string | null; incluir_no_pop?: boolean }) {
  const { data, error } = await supabase()
    .from('gravacao_marcacoes').update({ ...dados, atualizado_em: new Date().toISOString() })
    .eq('tenant_id', TENANT_PADRAO).match(d).eq('id', telaId).select('id').maybeSingle();
  if (error) throw error;
  if (!data) throw new ErroApi(404, 'Tela não encontrada');
  return data;
}

/**
 * Salva as marcações desenhadas na tela (ou remove, com `null`). A imagem final já foi enviada
 * pelo navegador; aqui só registramos o caminho e apagamos a versão anterior.
 */
export async function salvarAnotacao(d: Dono, telaId: string, a: { anotacoes: Anotacoes; imagem_anotada_caminho: string; largura: number; altura: number } | null) {
  if (a) {
    validarCaminho(d, a.imagem_anotada_caminho);
    if (!a.imagem_anotada_caminho.endsWith('.png')) throw new ErroApi(400, 'A imagem marcada deve ser PNG');
  }
  const db = supabase();
  const { data: atual, error: e1 } = await db.from('gravacao_marcacoes').select('imagem_anotada_caminho')
    .eq('tenant_id', TENANT_PADRAO).match(d).eq('id', telaId).maybeSingle();
  if (e1) throw e1;
  if (!atual) throw new ErroApi(404, 'Tela não encontrada');
  const { error } = await db.from('gravacao_marcacoes').update({
    anotacoes: a?.anotacoes ?? null,
    imagem_anotada_caminho: a?.imagem_anotada_caminho ?? null,
    anotada_largura: a?.largura ?? null,
    anotada_altura: a?.altura ?? null,
    atualizado_em: new Date().toISOString(),
  }).eq('tenant_id', TENANT_PADRAO).match(d).eq('id', telaId);
  if (error) throw error;
  if (atual.imagem_anotada_caminho && atual.imagem_anotada_caminho !== a?.imagem_anotada_caminho) {
    await db.storage.from(BUCKET).remove([atual.imagem_anotada_caminho]);
  }
  const url = a ? (await assinar([a.imagem_anotada_caminho])).get(a.imagem_anotada_caminho) ?? null : null;
  return { ok: true, imagem_anotada_url: url };
}

export async function excluir(d: Dono, telaId: string) {
  const { data, error } = await supabase()
    .from('gravacao_marcacoes').delete()
    .eq('tenant_id', TENANT_PADRAO).match(d).eq('id', telaId).select('imagem_caminho, imagem_anotada_caminho').maybeSingle();
  if (error) throw error;
  if (data) await supabase().storage.from(BUCKET).remove([data.imagem_caminho, data.imagem_anotada_caminho].filter(Boolean) as string[]);
  return { ok: true };
}

/** Apaga todos os arquivos da pasta do dono (ao excluir a gravação ou o POP). */
export async function removerPasta(d: Dono) {
  const pasta = pastaDe(d).slice(0, -1);
  const { data: arquivos } = await supabase().storage.from(BUCKET).list(pasta, { limit: 1000 });
  if (arquivos?.length) await supabase().storage.from(BUCKET).remove(arquivos.map((a) => `${pasta}/${a.name}`));
}

export async function assinar(caminhos: string[]) {
  const unicos = [...new Set(caminhos)];
  if (!unicos.length) return new Map<string, string>();
  const { data, error } = await supabase().storage.from(BUCKET).createSignedUrls(unicos, URL_VALIDADE_S);
  if (error) throw error;
  return new Map(data.filter((d) => d.signedUrl).map((d) => [d.path as string, d.signedUrl]));
}
