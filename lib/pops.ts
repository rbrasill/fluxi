// Cliente da API de POPs.
import { ErroCliente } from './fluxogramas';
import type { Anotacoes } from './marcacao/anotacoes';
import type { ConteudoPop, Historico } from './pop/schema';

export type PopResumo = {
  id: string; nome: string; codigo: string; identificacao: string; versao: string; status: string; autor: string;
  fluxograma_id: string | null; gravacao_id: string | null; processo_id: string | null; criado_em: string; atualizado_em: string;
};
export type TelaDoPop = { gravacao_id: string; imagem_url: string | null; largura: number | null; altura: number | null; anotacoes: Anotacoes | null };
export type Pop = PopResumo & { conteudo: ConteudoPop; historico: Historico[]; imagens: Record<string, string>; telas: Record<string, TelaDoPop> };

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, { ...init, headers: { 'content-type': 'application/json', ...init?.headers } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new ErroCliente(j.erro || `Erro ${r.status}`, r.status, j.codigo);
  return j as T;
}

export const listarPops = () => api<PopResumo[]>('/api/pops');
export const obterPop = (id: string) => api<Pop>(`/api/pops/${id}`);
export const criarPop = (dados: { nome?: string; gravacao_id?: string; fluxograma_id?: string; processo_id?: string }) =>
  api<{ id: string }>('/api/pops', { method: 'POST', body: JSON.stringify(dados) });
export const salvarPop = (id: string, dados: Partial<Pick<Pop, 'nome' | 'identificacao' | 'versao' | 'autor' | 'conteudo' | 'historico' | 'fluxograma_id' | 'status'>>) =>
  api<{ id: string }>(`/api/pops/${id}`, { method: 'PATCH', body: JSON.stringify(dados) });
export const excluirPop = (id: string) => api(`/api/pops/${id}`, { method: 'DELETE' });
export const urlDocx = (id: string) => `/api/pops/${id}/docx`;
export const urlPdf = (id: string) => `/api/pops/${id}/pdf`;
