// Cliente da API de organizações (empresas modeladas): Organização → Área → Processo → itens.
import { ErroCliente } from './fluxogramas';

export type OrganizacaoResumo = { id: string; nome: string; criado_em: string; atualizado_em: string; total_areas: number };
export type Organizacao = Omit<OrganizacaoResumo, 'total_areas'> & { areas: { id: string; nome: string; descricao: string; total_processos: number }[] };

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, { ...init, headers: { 'content-type': 'application/json', ...init?.headers } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new ErroCliente(j.erro || `Erro ${r.status}`, r.status, j.codigo);
  return j as T;
}

export const listarOrganizacoes = () => api<OrganizacaoResumo[]>('/api/organizacoes');
export const obterOrganizacao = (id: string) => api<Organizacao>(`/api/organizacoes/${id}`);
export const criarOrganizacao = (nome: string) => api<OrganizacaoResumo>('/api/organizacoes', { method: 'POST', body: JSON.stringify({ nome }) });
export const atualizarOrganizacao = (id: string, nome: string) => api(`/api/organizacoes/${id}`, { method: 'PATCH', body: JSON.stringify({ nome }) });
export const excluirOrganizacao = (id: string) => api(`/api/organizacoes/${id}`, { method: 'DELETE' });
