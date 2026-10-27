// Cliente da API de POPs.
import { ErroCliente } from './fluxogramas';
import type { Anotacoes } from './marcacao/anotacoes';
import type { ConteudoPop, Historico } from './pop/schema';

export type OndePop = { id: string; nome: string; area: { id: string; nome: string; organizacao: { id: string; nome: string } | null } | null } | null;
export type StatusPop = 'rascunho' | 'publicado';
export type PopResumo = {
  id: string; nome: string; codigo: string; identificacao: string; versao: string; status: StatusPop; autor: string;
  processo: OndePop;
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
export const salvarPop = (id: string, dados: Partial<Pick<Pop, 'nome' | 'identificacao' | 'versao' | 'autor' | 'conteudo' | 'historico' | 'fluxograma_id' | 'status' | 'processo_id'>>) =>
  api<{ id: string }>(`/api/pops/${id}`, { method: 'PATCH', body: JSON.stringify(dados) });
export const excluirPop = (id: string) => api(`/api/pops/${id}`, { method: 'DELETE' });
export const urlDocx = (id: string) => `/api/pops/${id}/docx`;
export const urlPdf = (id: string) => `/api/pops/${id}/pdf`;

/** "Organização · Área · Processo" de um POP (ou aviso de que está sem processo). */
export function ondeEsta(p: { processo: OndePop }) {
  const pr = p.processo;
  if (!pr) return 'Sem processo';
  return [pr.area?.organizacao?.nome, pr.area?.nome, pr.nome].filter(Boolean).join(' · ');
}

export const dataCurta = (iso: string) => new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
