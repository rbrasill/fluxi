// Cliente da API de áreas (primeiro nível: Área → Processos → itens do processo).
import { ErroCliente } from './fluxogramas';

export type AreaResumo = { id: string; nome: string; descricao: string; criado_em: string; atualizado_em: string; total_processos: number };
export type Area = Omit<AreaResumo, 'total_processos'> & {
  processos: { id: string; codigo: string; nome: string; descricao: string; atualizado_em: string; total: { fluxogramas: number; gravacoes: number; pops: number } }[];
};

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, { ...init, headers: { 'content-type': 'application/json', ...init?.headers } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new ErroCliente(j.erro || `Erro ${r.status}`, r.status, j.codigo);
  return j as T;
}

export const listarAreas = () => api<AreaResumo[]>('/api/areas');
export const obterArea = (id: string) => api<Area>(`/api/areas/${id}`);
export const criarArea = (dados: { nome: string; descricao?: string }) => api<AreaResumo>('/api/areas', { method: 'POST', body: JSON.stringify(dados) });
export const atualizarArea = (id: string, dados: { nome?: string; descricao?: string }) => api(`/api/areas/${id}`, { method: 'PATCH', body: JSON.stringify(dados) });
export const excluirArea = (id: string) => api(`/api/areas/${id}`, { method: 'DELETE' });
