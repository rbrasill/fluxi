// Cliente da API do perfil (decisão 84).
import { ErroCliente } from './fluxogramas';
import type { Nivel } from './pessoas';

export type Papel = 'entrevistado';
export type Perfil = {
  id: string; nome: string; email: string; nivel: Nivel;
  cargo: string; area_id: string | null; gestor: string; atividades: string;
  organizacao: string | null;
  areas: { id: string; nome: string; organizacao: string | null }[];
  processos: { processo_id: string; nome: string; area: string | null; papeis: Papel[]; quando: string; entrevista_id: string }[];
  disponivel: boolean;
};
export type AlteracaoDoPerfil = Partial<Pick<Perfil, 'nome' | 'cargo' | 'area_id' | 'gestor' | 'atividades'>>;

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, { ...init, headers: { 'content-type': 'application/json', ...init?.headers } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new ErroCliente(j.erro || `Erro ${r.status}`, r.status, j.codigo);
  return j as T;
}

export const obterPerfil = () => api<Perfil>('/api/perfil');
export const salvarPerfil = (d: AlteracaoDoPerfil) => api<{ ok: true }>('/api/perfil', { method: 'PATCH', body: JSON.stringify(d) });

/** Quanto do perfil está preenchido: nome, e-mail (sempre), cargo, área e o que a pessoa faz. O gestor é opcional. */
export function perfilCompleto(p: Pick<Perfil, 'nome' | 'email' | 'cargo' | 'area_id' | 'atividades'>) {
  const itens = [p.nome.trim(), p.email, p.cargo.trim(), p.area_id, p.atividades.trim()];
  return Math.round((itens.filter(Boolean).length / itens.length) * 100);
}
