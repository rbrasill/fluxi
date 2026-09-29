// Cliente da API de gravações.
import { ErroCliente } from './fluxogramas';

export type GravacaoResumo = { id: string; nome: string; status: string; duracao_ms: number | null; criado_em: string; total_marcacoes: number };
export type SegmentoGravado = { indice: number; caminho: string; inicio_ms: number; duracao_ms: number; bytes: number; mime: string; url: string | null };
export type Marcacao = {
  id: string; tempo_ms: number; imagem_caminho: string; imagem_url: string | null; largura: number | null; altura: number | null;
  instrucao: string | null; instrucao_ia: string | null; incluir_no_pop: boolean;
};
export type Gravacao = Omit<GravacaoResumo, 'total_marcacoes'> & { largura: number | null; altura: number | null; segmentos: SegmentoGravado[]; marcacoes: Marcacao[] };

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, { ...init, headers: { 'content-type': 'application/json', ...init?.headers } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new ErroCliente(j.erro || `Erro ${r.status}`, r.status, j.codigo);
  return j as T;
}
const json = (method: string, body: unknown): RequestInit => ({ method, body: JSON.stringify(body) });

export const listarGravacoes = () => api<GravacaoResumo[]>('/api/gravacoes');
export const obterGravacao = (id: string) => api<Gravacao>(`/api/gravacoes/${id}`);
export const criarGravacao = (nome: string) => api<{ id: string }>('/api/gravacoes', json('POST', { nome }));
export const atualizarGravacao = (id: string, dados: Partial<{ nome: string; status: string; duracao_ms: number; largura: number; altura: number }>) =>
  api(`/api/gravacoes/${id}`, json('PATCH', dados));
export const excluirGravacao = (id: string) => api(`/api/gravacoes/${id}`, { method: 'DELETE' });
export const atualizarMarcacao = (id: string, mid: string, dados: { instrucao?: string | null; incluir_no_pop?: boolean }) =>
  api(`/api/gravacoes/${id}/marcacoes/${mid}`, json('PATCH', dados));
export const excluirMarcacao = (id: string, mid: string) => api(`/api/gravacoes/${id}/marcacoes/${mid}`, { method: 'DELETE' });

/** Envia um arquivo direto para o Storage (URL assinada) e devolve o caminho salvo. */
export async function enviarArquivo(id: string, tipo: 'segmento' | 'imagem', blob: Blob, extensao: string) {
  const up = await api<{ caminho: string; url: string }>(`/api/gravacoes/${id}/upload`, json('POST', { tipo, extensao }));
  const r = await fetch(up.url, { method: 'PUT', body: blob, headers: { 'content-type': blob.type || 'application/octet-stream' } });
  if (!r.ok) throw new ErroCliente(`Falha no envio (${r.status})`, r.status);
  return up.caminho;
}

export const registrarSegmento = (id: string, s: Omit<SegmentoGravado, 'url'>) => api(`/api/gravacoes/${id}/segmentos`, json('POST', s));
export const registrarMarcacao = (id: string, m: { tempo_ms: number; imagem_caminho: string; instrucao?: string; largura?: number; altura?: number }) =>
  api<{ id: string }>(`/api/gravacoes/${id}/marcacoes`, json('POST', m));

export function formatarTempo(ms: number) {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}
