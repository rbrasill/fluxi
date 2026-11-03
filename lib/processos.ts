// Cliente da API de processos (a "pasta" de cada processo).
import { ErroCliente } from './fluxogramas';

export type ProcessoResumo = {
  id: string; codigo: string; nome: string; descricao: string; area_id: string; area: { id: string; nome: string; organizacao: { id: string; nome: string } | null } | null;
  arquivado_em: string | null; criado_em: string; atualizado_em: string;
  total: { fluxogramas: number; gravacoes: number; pops: number };
};
export type Processo = Omit<ProcessoResumo, 'total'> & {
  fluxogramas: { id: string; codigo: string; nome: string; origem: string; miniatura: string | null; atualizado_em: string }[];
  gravacoes: { id: string; nome: string; status: string; duracao_ms: number | null; processamento: string; criado_em: string; total_marcacoes: number; transcrita: boolean }[];
  pops: { id: string; nome: string; codigo: string; identificacao: string; versao: string; status: string; arquivado_em: string | null; atualizado_em: string }[];
};

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, { ...init, headers: { 'content-type': 'application/json', ...init?.headers } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new ErroCliente(j.erro || `Erro ${r.status}`, r.status, j.codigo);
  return j as T;
}

/** Processos ativos; com `arquivados`, só os arquivados. */
export const listarProcessos = (arquivados = false) => api<ProcessoResumo[]>(`/api/processos${arquivados ? '?arquivados=1' : ''}`);
export const obterProcesso = (id: string) => api<Processo>(`/api/processos/${id}`);
export const criarProcesso = (dados: { nome: string; area_id: string; descricao?: string }) =>
  api<ProcessoResumo>('/api/processos', { method: 'POST', body: JSON.stringify(dados) });
export const atualizarProcesso = (id: string, dados: { nome?: string; area_id?: string; descricao?: string }) =>
  api<{ id: string }>(`/api/processos/${id}`, { method: 'PATCH', body: JSON.stringify(dados) });
/** Arquiva (some das listas com tudo o que tem; nada é apagado) e restaura. */
export const arquivarProcesso = (id: string) => api(`/api/processos/${id}/arquivar`, { method: 'POST' });
export const restaurarProcesso = (id: string) => api(`/api/processos/${id}/restaurar`, { method: 'POST' });
/** Só processo arquivado: apaga com os POPs, gravações e fluxograma dele. */
export const excluirProcesso = (id: string) => api(`/api/processos/${id}`, { method: 'DELETE' });

/** Move um item para um processo (ou tira de todos, com null). */
export const moverParaProcesso = (tipo: 'fluxogramas' | 'gravacoes' | 'pops', id: string, processo_id: string | null) =>
  api(`/api/${tipo}/${id}`, { method: 'PATCH', body: JSON.stringify({ processo_id }) });
