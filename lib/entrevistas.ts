// Cliente da API da entrevista por voz com a IA (decisões 39 e 41).
import type { Metricas, ResultadoEntrevista, StatusEntrevista, Turno } from './entrevista/topicos';
import { ErroCliente } from './fluxogramas';

export type Entrevista = {
  id: string; tema: string; contexto: string; motor: string; status: StatusEntrevista;
  turnos: Turno[]; sessoes: string[]; metricas: Metricas;
  resultado: ResultadoEntrevista | null; erro: string | null; audios: string[]; frase_final: string; frase_pausa: string;
  criado_em: string; encerrado_em: string | null; atualizado_em: string;
};
export type EntrevistaResumo = { id: string; tema: string; status: StatusEntrevista; criado_em: string; encerrado_em: string | null; falas: number; duracao_s: number; custo_analise_usd: number; custo_consultas_usd: number };

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, { ...init, headers: { 'content-type': 'application/json', ...init?.headers } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new ErroCliente(j.erro || `Erro ${r.status}`, r.status, j.codigo);
  return j as T;
}

export const criarEntrevista = (dados: { tema: string; contexto?: string }) => api<{ id: string }>('/api/entrevistas', { method: 'POST', body: JSON.stringify(dados) });
export const listarEntrevistas = () => api<EntrevistaResumo[]>('/api/entrevistas');
export const obterEntrevista = (id: string) => api<Entrevista>(`/api/entrevistas/${id}`);
export const excluirEntrevista = (id: string) => api(`/api/entrevistas/${id}`, { method: 'DELETE' });
/** Abre a sessão de voz no GPT-Live: manda a oferta WebRTC e recebe a resposta. */
export const abrirSessaoDeVoz = (id: string, sdp: string) => api<{ sdp: string; continuando: boolean; openai_ms?: number }>(`/api/entrevistas/${id}/sessao`, { method: 'POST', body: JSON.stringify({ sdp }) });
/** Guarda a conversa transcrita e as métricas (durante a sessão e no fim). */
export const salvarConversa = (id: string, dados: { turnos: Turno[]; metricas?: Metricas }) =>
  api<{ ok: true }>(`/api/entrevistas/${id}/conversa`, { method: 'PUT', body: JSON.stringify(dados), keepalive: JSON.stringify(dados).length < 60_000 });
/** Uma consulta da IA no meio da conversa: manda o fim da conversa, recebe o que ela foi verificar e a resposta. */
export const consultarDuranteEntrevista = (id: string, turnos: Turno[]) =>
  api<{ pergunta: string; resposta: string; modelo: string; demora_ms: number; custo_usd: number }>(`/api/entrevistas/${id}/consulta`, { method: 'POST', body: JSON.stringify({ turnos }), signal: AbortSignal.timeout(15_000) });
/** Encerra e gera o resultado (demora: a conversa inteira é analisada). */
export const encerrarEntrevista = (id: string) => api<{ status: StatusEntrevista }>(`/api/entrevistas/${id}/encerrar`, { method: 'POST' });

/** Envia o áudio gravado da conversa ao Storage e registra na entrevista. */
export async function enviarAudioDaEntrevista(id: string, blob: Blob) {
  const up = await api<{ caminho: string; url: string }>(`/api/entrevistas/${id}/audio`, { method: 'POST' });
  const r = await fetch(up.url, { method: 'PUT', body: blob, headers: { 'content-type': blob.type || 'audio/webm' } });
  if (!r.ok) throw new Error(`Não foi possível enviar o áudio (${r.status}).`);
  await api(`/api/entrevistas/${id}`, { method: 'PATCH', body: JSON.stringify({ audio_caminho: up.caminho }) });
}
