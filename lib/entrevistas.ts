// Cliente da API da entrevista por voz com a Maia (decisões 39, 41 e 53).
import type { Complemento, Metricas, ResultadoEntrevista, StatusEntrevista, Turno } from './entrevista/topicos';
import { ErroCliente } from './fluxogramas';

export type Entrevista = {
  id: string; processo_id: string | null; tema: string; contexto: string; motor: string; status: StatusEntrevista;
  turnos: Turno[]; sessoes: string[]; metricas: Metricas;
  resultado: ResultadoEntrevista | null; erro: string | null; audios: string[]; frase_final: string; frase_pausa: string;
  entrevistado_id: string | null; entrevistado: string | null;
  convidador: string | null; convidado_em: string | null; nota_convite: string; convite_enviado_em: string | null; iniciada_em: string | null;
  complemento: Complemento | null;
  processo: { id: string; nome: string; area: { id: string; nome: string; organizacao: { id: string; nome: string } | null } | null } | null;
  criado_em: string; encerrado_em: string | null; atualizado_em: string;
};
export type EntrevistaResumo = {
  id: string; tema: string; status: StatusEntrevista; entrevistado_id: string | null; entrevistado: string | null; processo: { id: string; nome: string } | null;
  convidado_em: string | null; convite_enviado_em: string | null; criado_em: string; encerrado_em: string | null;
  complemento_pendencias: number | null;
  falas: number; duracao_s: number; custo_analise_usd: number; custo_consultas_usd: number;
};
/** Uma entrevista na página do processo. */
export type EntrevistaDoProcesso = {
  id: string; status: StatusEntrevista; entrevistado_id: string | null; entrevistado: string | null; convidado_por: string | null;
  convidado_em: string | null; convite_enviado_em: string | null; iniciada_em: string | null; criado_em: string; encerrado_em: string | null;
  complemento_pendencias: number | null;
  falas: number; duracao_s: number; tem_resultado: boolean; pendencias: number;
};
export type ResultadoConvite = { criadas: { id: string; pessoa: string; email_enviado: boolean }[]; repetidas: string[]; carteiro_configurado: boolean };

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, { ...init, headers: { 'content-type': 'application/json', ...init?.headers } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new ErroCliente(j.erro || `Erro ${r.status}`, r.status, j.codigo);
  return j as T;
}

export const listarEntrevistas = () => api<EntrevistaResumo[]>('/api/entrevistas');
export const obterEntrevista = (id: string) => api<Entrevista>(`/api/entrevistas/${id}`);
export const excluirEntrevista = (id: string) => api(`/api/entrevistas/${id}`, { method: 'DELETE' });
/** As entrevistas de um processo. */
export const listarEntrevistasDoProcesso = (processoId: string) => api<EntrevistaDoProcesso[]>(`/api/processos/${processoId}/entrevistas`);
/** Convida até três pessoas para entrevistas sobre o processo (gestores e administradores). */
export const convidarParaEntrevista = (processoId: string, dados: { pessoas: string[]; nota?: string }) =>
  api<ResultadoConvite>(`/api/processos/${processoId}/entrevistas`, { method: 'POST', body: JSON.stringify(dados) });
/** Manda o e-mail do convite de novo. */
export const reenviarConvite = (id: string) => api<{ ok: true }>(`/api/entrevistas/${id}/convite`, { method: 'POST' });
/** Aquece no servidor a rota que abre a sessão (sem custo: não chama a OpenAI). */
export const aquecerSessaoDeVoz = (id: string) => { void fetch(`/api/entrevistas/${id}/sessao`).catch(() => {}); };
/** Abre a sessão de voz no GPT-Live: manda a oferta WebRTC e recebe a resposta. */
export const abrirSessaoDeVoz = (id: string, sdp: string) => api<{ sdp: string; continuando: boolean; openai_ms?: number; complemento?: boolean }>(`/api/entrevistas/${id}/sessao`, { method: 'POST', body: JSON.stringify({ sdp }) });
/** Guarda a conversa transcrita e as métricas (durante a sessão e no fim). */
export const salvarConversa = (id: string, dados: { turnos: Turno[]; metricas?: Metricas }) =>
  api<{ ok: true }>(`/api/entrevistas/${id}/conversa`, { method: 'PUT', body: JSON.stringify(dados), keepalive: JSON.stringify(dados).length < 60_000 });
/** Uma consulta da Maia no meio da conversa: manda o fim da conversa, recebe o que ela foi verificar e a resposta. */
export const consultarDuranteEntrevista = (id: string, turnos: Turno[]) =>
  api<{ pergunta: string; resposta: string; modelo: string; demora_ms: number; custo_usd: number }>(`/api/entrevistas/${id}/consulta`, { method: 'POST', body: JSON.stringify({ turnos }), signal: AbortSignal.timeout(15_000) });
/** Volta à ligação para responder pontos em aberto (decisão 56): a pessoa entrevistada escolhe; gestores marcam para ela. */
export const retomarEntrevista = (id: string, pendencias: string[]) => api<{ ok: true; pendencias: number }>(`/api/entrevistas/${id}/retomar`, { method: 'POST', body: JSON.stringify({ pendencias }) });
/** Desiste do complemento antes de a conversa continuar. */
export const desistirComplemento = (id: string) => api<{ ok: true }>(`/api/entrevistas/${id}/retomar`, { method: 'DELETE' });
/** Encerra e gera o resultado (demora: a conversa inteira é analisada). */
export const encerrarEntrevista = (id: string) => api<{ status: StatusEntrevista }>(`/api/entrevistas/${id}/encerrar`, { method: 'POST' });

/** Envia o áudio gravado da conversa ao Storage e registra na entrevista. */
export async function enviarAudioDaEntrevista(id: string, blob: Blob) {
  const up = await api<{ caminho: string; url: string }>(`/api/entrevistas/${id}/audio`, { method: 'POST' });
  const r = await fetch(up.url, { method: 'PUT', body: blob, headers: { 'content-type': blob.type || 'audio/webm' } });
  if (!r.ok) throw new Error(`Não foi possível enviar o áudio (${r.status}).`);
  await api(`/api/entrevistas/${id}`, { method: 'PATCH', body: JSON.stringify({ audio_caminho: up.caminho }) });
}

/** A confirmação antes de cancelar um convite ou excluir uma entrevista (decisão 54). */
export function confirmacaoDeExclusao(e: { status: StatusEntrevista; falas: number; entrevistado: string | null }) {
  const quem = e.entrevistado ?? 'esta pessoa';
  if (e.status === 'convidada') return { titulo: `Cancelar o convite de ${quem}?`, mensagem: 'A pessoa não vai mais conseguir abrir esta entrevista. Dá para convidar de novo depois.', acao: 'Cancelar convite', perigo: true };
  const pausada = e.status === 'em_andamento' && e.falas > 0;
  return {
    titulo: `Excluir a entrevista de ${quem}?`,
    mensagem: `${pausada ? 'A entrevista está pausada e ainda pode ser retomada. ' : ''}A conversa, o áudio e o resultado são apagados de vez; não dá para desfazer.`,
    acao: 'Excluir', perigo: true,
  };
}

/** O rótulo da situação como a tela mostra: uma entrevista em andamento com falas está pausada; um convite sem e-mail, avisado. */
export function situacaoDaEntrevista(e: { status: StatusEntrevista; falas: number; convite_enviado_em?: string | null; complemento_pendencias?: number | null }) {
  if (e.status === 'convidada') return e.convite_enviado_em ? 'Convite enviado' : 'Convite sem e-mail';
  if (e.status === 'em_andamento' && e.complemento_pendencias) return `Completar: ${e.complemento_pendencias} ${e.complemento_pendencias === 1 ? 'ponto' : 'pontos'}`;
  if (e.status === 'em_andamento') return e.falas > 0 ? 'Pausada' : 'Em andamento';
  if (e.status === 'processando') return 'Gerando o resultado';
  if (e.status === 'concluida') return 'Concluída';
  return 'Erro ao gerar o resultado';
}
