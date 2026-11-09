// Cliente da API de pessoas e acessos (decisão 50).
import { ErroCliente } from './fluxogramas';

export type Nivel = 'comum' | 'gestor' | 'admin';
export type PessoaResumo = { id: string; nome: string; email: string; nivel: Nivel; criado_em: string };
export const ROTULO_NIVEL: Record<Nivel, string> = { comum: 'Comum', gestor: 'Gestor', admin: 'Administrador' };

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, { ...init, headers: { 'content-type': 'application/json', ...init?.headers } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new ErroCliente(j.erro || `Erro ${r.status}`, r.status, j.codigo);
  return j as T;
}

export const listarPessoas = () => api<PessoaResumo[]>('/api/pessoas');
export const criarPessoa = (d: { nome: string; email: string; nivel: Nivel }) => api<{ id: string }>('/api/pessoas', { method: 'POST', body: JSON.stringify(d) });
export const alterarPessoa = (id: string, d: { nome?: string; nivel?: Nivel }) => api(`/api/pessoas/${id}`, { method: 'PATCH', body: JSON.stringify(d) });
export const excluirPessoa = (id: string) => api(`/api/pessoas/${id}`, { method: 'DELETE' });
