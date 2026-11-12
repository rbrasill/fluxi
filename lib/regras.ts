// Cliente da API das regras de negócio do processo (decisão 89).
import type { TipoRegra } from './entrevista/topicos';
import { ErroCliente } from './fluxogramas';

export type Regra = {
  id: string; tipo: TipoRegra; texto: string; situacao: 'sugerida' | 'confirmada'; codigo: string; origem: 'maia' | 'manual';
  pop: { id: string; rotulo: string } | null; // a que se aplica; vazio: o processo inteiro
  entrevista: { id: string; entrevistado: string | null } | null;
  trecho: string; trecho_ms: number | null;
  conflito: { codigo: string; texto: string } | null;
  perguntar: boolean; // marcada para a Maia perguntar na próxima entrevista de regras
  esclarecimento: { texto: string; de: string | null } | null;
  criado_por: string | null; confirmada_por: string | null; confirmada_em: string | null; criado_em: string;
};
export type FonteDeRegras = { id: string; status: string; entrevistado: string | null; quando: string; duracao_s: number; sugestoes: number };
export type RegrasDoProcesso = {
  /** Falso enquanto a migração 0024 não está no banco. */
  disponivel: boolean;
  regras: Regra[];
  confirmador: { id: string; nome: string } | null;
  pode_confirmar: boolean;
  pops: { id: string; rotulo: string }[];
  fontes: FonteDeRegras[];
};
export type DadosDaRegra = { texto: string; tipo: TipoRegra; pop_id: string | null };
export type AcaoDaRegra = 'confirmar' | 'descartar' | 'arquivar' | 'perguntar' | 'nao_perguntar';

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, { ...init, headers: { 'content-type': 'application/json', ...init?.headers } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new ErroCliente(j.erro || `Erro ${r.status}`, r.status, j.codigo);
  return j as T;
}

export const listarRegras = (processoId: string) => api<RegrasDoProcesso>(`/api/processos/${processoId}/regras`);
export const criarRegra = (processoId: string, d: DadosDaRegra) => api<{ id: string; codigo: string }>(`/api/processos/${processoId}/regras`, { method: 'POST', body: JSON.stringify(d) });
export const editarRegra = (id: string, d: Partial<DadosDaRegra>) => api<{ ok: true; codigo: string }>(`/api/regras/${id}`, { method: 'PATCH', body: JSON.stringify(d) });
export const agirNaRegra = (id: string, acao: AcaoDaRegra) => api<{ ok: true; codigo: string }>(`/api/regras/${id}`, { method: 'PATCH', body: JSON.stringify({ acao }) });
export const escolherConfirmador = (processoId: string, pessoa: string | null) => api<{ ok: true }>(`/api/processos/${processoId}/regras/confirmador`, { method: 'PUT', body: JSON.stringify({ pessoa }) });
/** A gravação e o segundo em que a fala começa. */
export const audioDaRegra = (id: string) => api<{ url: string; segundos: number }>(`/api/regras/${id}/audio`);
/** Os processos com regras à espera da revisão de quem está logado. */
export const regrasParaRevisar = () => api<{ id: string; nome: string; sugeridas: number }[]>('/api/regras/pendentes');
