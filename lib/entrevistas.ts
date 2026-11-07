// Cliente da API da entrevista por voz com a IA (decisão 39).
import type { ResultadoEntrevista, StatusEntrevista, Turno } from './entrevista/topicos';
import { ErroCliente } from './fluxogramas';

export type Entrevista = {
  id: string; processo_id: string; status: StatusEntrevista;
  turnos: Turno[]; cobertos: string[]; anotacoes: string[];
  resultado: ResultadoEntrevista | null; erro: string | null; audio_url: string | null;
  criado_em: string; encerrado_em: string | null; atualizado_em: string;
  processo: { id: string; codigo: string; nome: string; area: string | null; organizacao: string | null; arquivado: boolean; descricao_vazia: boolean; tem_fluxograma: boolean };
};
export type EntrevistaResumo = { id: string; status: StatusEntrevista; criado_em: string; encerrado_em: string | null; perguntas: number; respostas: number };

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, { ...init, headers: { 'content-type': 'application/json', ...init?.headers } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new ErroCliente(j.erro || `Erro ${r.status}`, r.status, j.codigo);
  return j as T;
}

export const criarEntrevista = (processo_id: string) => api<{ id: string; fala: string }>('/api/entrevistas', { method: 'POST', body: JSON.stringify({ processo_id }) });
export const listarEntrevistas = (processo_id: string) => api<EntrevistaResumo[]>(`/api/entrevistas?processo_id=${processo_id}`);
export const obterEntrevista = (id: string) => api<Entrevista>(`/api/entrevistas/${id}`);
export const excluirEntrevista = (id: string) => api(`/api/entrevistas/${id}`, { method: 'DELETE' });
/** A pessoa falou: a IA responde com a próxima fala (e avisa quando é a despedida). `corte`: ela falou por cima da IA. */
export const responderTurno = (id: string, texto: string, corte?: { interrompeu: true; ouviu: number }) =>
  api<{ fala: string; encerrar: boolean; cobertos: string[]; perguntas: number }>(`/api/entrevistas/${id}/turno`, { method: 'POST', body: JSON.stringify({ texto, ...corte }) });
/** Encerra e gera o resultado (demora: a conversa inteira é analisada). */
export const encerrarEntrevista = (id: string) => api<{ status: StatusEntrevista }>(`/api/entrevistas/${id}/encerrar`, { method: 'POST' });
/** Endereço da escuta ao vivo (token temporário) e os termos a reforçar no reconhecimento. */
export const escutaDaEntrevista = (id: string) => api<{ url: string; termos: string[] }>(`/api/entrevistas/${id}/escuta`, { method: 'POST' });

/** A fala da IA em áudio. */
export async function vozDaEntrevista(id: string, texto: string): Promise<Blob> {
  const r = await fetch(`/api/entrevistas/${id}/voz`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ texto }) });
  if (!r.ok) {
    const j = await r.json().catch(() => ({}));
    throw new ErroCliente(j.erro || `Erro ${r.status}`, r.status, j.codigo);
  }
  return r.blob();
}

/** Envia o áudio gravado da conversa ao Storage e registra na entrevista. */
export async function enviarAudioDaEntrevista(id: string, blob: Blob) {
  const up = await api<{ caminho: string; url: string }>(`/api/entrevistas/${id}/audio`, { method: 'POST' });
  const r = await fetch(up.url, { method: 'PUT', body: blob, headers: { 'content-type': blob.type || 'audio/webm' } });
  if (!r.ok) throw new Error(`Não foi possível enviar o áudio (${r.status}).`);
  await api(`/api/entrevistas/${id}`, { method: 'PATCH', body: JSON.stringify({ audio_caminho: up.caminho }) });
}
