// Cliente da API da entrevista por voz com a Maia (decisões 39, 41 e 53).
import type { Complemento, Finalidade, Metricas, PendenciaOutraPessoa, ResultadoEntrevista, StatusEntrevista, Turno } from './entrevista/topicos';
import { ErroCliente } from './fluxogramas';

export type Entrevista = {
  finalidade: Finalidade; // mapeamento de processo ou regras de negócio (decisão 89)
  id: string; processo_id: string | null; tema: string; contexto: string; motor: string; status: StatusEntrevista;
  turnos: Turno[]; sessoes: string[]; metricas: Metricas;
  resultado: ResultadoEntrevista | null; erro: string | null; audios: string[]; frase_final: string; frase_pausa: string;
  entrevistado_id: string | null; entrevistado: string | null;
  convidador: string | null; convidado_em: string | null; nota_convite: string; convite_enviado_em: string | null; iniciada_em: string | null;
  complemento: Complemento | null;
  /** A pessoa está na ligação com a Maia agora (decisão 69). */
  em_ligacao: boolean;
  /** Durante a ligação, quem não é a pessoa entrevistada recebe a entrevista sem as falas, os áudios e o resultado
   *  (também quem não é gestor nem administrador, quando a entrevista está arquivada). */
  conteudo_oculto: boolean;
  /** Arquivada (decisão 72): fora do fluxo do processo, guardada em Arquivadas; quando e por quem. */
  arquivado_em: string | null; arquivador: string | null;
  processo: { id: string; nome: string; area: { id: string; nome: string; organizacao: { id: string; nome: string } | null } | null } | null;
  criado_em: string; encerrado_em: string | null; atualizado_em: string;
};
export type EntrevistaResumo = {
  finalidade: Finalidade;
  id: string; tema: string; status: StatusEntrevista; entrevistado_id: string | null; entrevistado: string | null;
  processo: { id: string; nome: string; area: { id: string; nome: string } | null } | null;
  convidado_por: string | null; convidado_em: string | null; convite_enviado_em: string | null; iniciada_em: string | null; criado_em: string; encerrado_em: string | null;
  complemento_pendencias: number | null; em_ligacao: boolean; arquivado_em: string | null; arquivado_por: string | null;
  falas: number; duracao_s: number; custo_analise_usd: number; custo_consultas_usd: number;
};
/** Uma entrevista na página do processo. */
export type EntrevistaDoProcesso = {
  finalidade: Finalidade; regras_sugeridas: number | null; // na entrevista de regras concluída: quantas regras a Maia sugeriu
  id: string; status: StatusEntrevista; entrevistado_id: string | null; entrevistado: string | null; entrevistado_area: string | null; convidado_por: string | null;
  convidado_em: string | null; convite_enviado_em: string | null; iniciada_em: string | null; criado_em: string; encerrado_em: string | null;
  complemento_pendencias: number | null; em_ligacao: boolean; arquivado_em: string | null; arquivado_por: string | null;
  falas: number; duracao_s: number; tem_resultado: boolean; pendencias: number;
  pendencias_outra_pessoa: PendenciaOutraPessoa[];
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
/** Só a situação da entrevista (leve): para a tela perceber quando a ligação começa ou termina (decisão 69). */
export const consultarSituacao = (id: string) => api<{ status: StatusEntrevista; em_ligacao: boolean }>(`/api/entrevistas/${id}/situacao`);
/** Cancela um convite que não começou ou exclui definitivamente uma entrevista arquivada (decisão 72). */
export const excluirEntrevista = (id: string) => api(`/api/entrevistas/${id}`, { method: 'DELETE' });
/** Arquiva a entrevista: sai do fluxo do processo e fica guardada em Arquivadas (gestores e administradores). */
export const arquivarEntrevista = (id: string) => api<{ ok: true }>(`/api/entrevistas/${id}/arquivar`, { method: 'POST' });
/** Devolve a entrevista arquivada à lista de ativas do processo. */
export const restaurarEntrevista = (id: string) => api<{ ok: true }>(`/api/entrevistas/${id}/restaurar`, { method: 'POST' });
/** As entrevistas de um processo. */
export const listarEntrevistasDoProcesso = (processoId: string) => api<EntrevistaDoProcesso[]>(`/api/processos/${processoId}/entrevistas`);
/** Convida até três pessoas para entrevistas sobre o processo (gestores e administradores). */
export const convidarParaEntrevista = (processoId: string, dados: { pessoas: string[]; nota?: string; finalidade?: Finalidade }) =>
  api<ResultadoConvite>(`/api/processos/${processoId}/entrevistas`, { method: 'POST', body: JSON.stringify(dados) });
/** Entrevista imediata (decisão 74): abre na hora a entrevista de quem está logado sobre o processo, sem convite (só quem pode). */
export const iniciarEntrevistaAgora = (processoId: string, finalidade: Finalidade = 'processo') =>
  api<{ id: string; nova: boolean }>(`/api/processos/${processoId}/entrevistas/iniciar`, { method: 'POST', body: JSON.stringify({ finalidade }) });
/** Manda o e-mail do convite de novo. */
export const reenviarConvite = (id: string) => api<{ ok: true }>(`/api/entrevistas/${id}/convite`, { method: 'POST' });
/** Aquece no servidor a rota que abre a sessão (sem custo: não chama a OpenAI). */
export const aquecerSessaoDeVoz = (id: string) => { void fetch(`/api/entrevistas/${id}/sessao`).catch(() => {}); };
/** Abre a sessão de voz no GPT-Live: manda a oferta WebRTC e recebe a resposta. */
export const abrirSessaoDeVoz = (id: string, sdp: string) => api<{ sdp: string; continuando: boolean; openai_ms?: number; complemento?: boolean }>(`/api/entrevistas/${id}/sessao`, { method: 'POST', body: JSON.stringify({ sdp }) });
/** Guarda a conversa transcrita e as métricas (durante a sessão e no fim). */
export const salvarConversa = (id: string, dados: { turnos: Turno[]; metricas?: Metricas; em_ligacao?: boolean }) =>
  api<{ ok: true }>(`/api/entrevistas/${id}/conversa`, { method: 'PUT', body: JSON.stringify(dados), keepalive: JSON.stringify(dados).length < 60_000 });
/** O pulso da ligação (decisão 69): avisa que a conversa com a Maia continua (ou, com `false`, que a página fechou). */
export const pulsoDaLigacao = (id: string, ligada = true) =>
  api<{ ok: boolean }>(`/api/entrevistas/${id}/pulso`, { method: ligada ? 'POST' : 'DELETE', keepalive: true });
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

/** A confirmação antes de cancelar um convite ou excluir definitivamente uma entrevista arquivada (decisões 54 e 72). */
export function confirmacaoDeExclusao(e: { status: StatusEntrevista; falas: number; entrevistado: string | null; convidado_em?: string | null }) {
  const quem = e.entrevistado ?? 'esta pessoa';
  // Aberta sem convite (decisão 74) e ainda não começada: não há convite para cancelar, só a entrevista vazia.
  if (e.status === 'convidada' && e.convidado_em === null) return { titulo: `Cancelar a entrevista de ${quem}?`, mensagem: 'Ela foi aberta sem convite e ainda não começou: nada é perdido. Dá para abrir outra depois.', acao: 'Cancelar entrevista', perigo: true };
  if (e.status === 'convidada') return { titulo: `Cancelar o convite de ${quem}?`, mensagem: 'A pessoa não vai mais conseguir abrir esta entrevista. Dá para convidar de novo depois.', acao: 'Cancelar convite', perigo: true };
  return { titulo: `Excluir definitivamente a entrevista de ${quem}?`, mensagem: 'A conversa, o áudio e o resultado são apagados de vez. Não dá para desfazer.', acao: 'Excluir definitivamente', perigo: true };
}

/** A confirmação antes de arquivar uma entrevista (decisão 72). */
export function confirmacaoDeArquivamento(e: { status: StatusEntrevista; entrevistado: string | null }) {
  const quem = e.entrevistado ?? 'esta pessoa';
  return {
    titulo: `Arquivar a entrevista de ${quem}?`,
    mensagem: `A entrevista sai da lista do processo, deixa de entrar no fluxograma e nas perguntas para outras pessoas, e não pode ser continuada${e.status === 'em_andamento' ? ' (ela está pausada)' : ''}. Nada é apagado: a conversa, o áudio e o resultado ficam guardados em Arquivadas, e dá para restaurar depois.`,
    acao: 'Arquivar',
  };
}

// O aviso que uma tela deixa para a seção de entrevistas do processo mostrar na volta (decisão 72): "arquivada", "excluída".
export type AvisoDeEntrevistas = { texto: string; aba?: 'arquivadas' };
const chaveAviso = (processoId: string) => `incflow:aviso-entrevistas:${processoId}`;
export function deixarAvisoDeEntrevistas(processoId: string, aviso: AvisoDeEntrevistas) {
  try { sessionStorage.setItem(chaveAviso(processoId), JSON.stringify(aviso)); } catch { /* sem armazenamento: só não aparece o aviso */ }
}
export function pegarAvisoDeEntrevistas(processoId: string): AvisoDeEntrevistas | null {
  try {
    const v = sessionStorage.getItem(chaveAviso(processoId));
    if (!v) return null;
    sessionStorage.removeItem(chaveAviso(processoId));
    return JSON.parse(v) as AvisoDeEntrevistas;
  } catch { return null; }
}

/** As perguntas para outras pessoas, juntas por quem saberia responder (decisão 58), com quem não soube. */
export function perguntasParaOutrasPessoas(lista: { entrevistado: string | null; pendencias_outra_pessoa: PendenciaOutraPessoa[] }[]) {
  const grupos = new Map<string, { quem_sabe: string; perguntas: { pergunta: string; de: string | null }[] }>();
  for (const e of lista) for (const p of e.pendencias_outra_pessoa ?? []) {
    const chave = p.quem_sabe.trim().toLocaleLowerCase('pt-BR');
    const g = grupos.get(chave) ?? { quem_sabe: p.quem_sabe.trim(), perguntas: [] };
    g.perguntas.push({ pergunta: p.pergunta, de: e.entrevistado });
    grupos.set(chave, g);
  }
  return [...grupos.values()];
}

/** O pedido do convite já com as perguntas (até 500 caracteres, o limite da nota). */
export function notaParaOutraPessoa(quemSabe: string, perguntas: string[]) {
  const texto = `Perguntas que ficaram para alguém de ${quemSabe}: ${perguntas.join(' ')}`;
  return texto.length <= 500 ? texto : `${texto.slice(0, 497).trimEnd()}…`;
}

const dataHora = (iso: string) => { const d = new Date(iso); return `${d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })} às ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`; };

/** Quando foi a entrevista, com data e hora (decisão 60): a conversa, se já começou; senão, o convite. */
export function quandoFoiAEntrevista(e: { status: StatusEntrevista; falas: number; convidado_por?: string | null; convidado_em: string | null; iniciada_em: string | null; criado_em: string }) {
  const comecou = e.status !== 'convidada' && (!!e.iniciada_em || e.falas > 0 || !e.convidado_em);
  if (comecou) return `Conversa em ${dataHora(e.iniciada_em ?? e.criado_em)}`;
  if (!e.convidado_em) return `Aberta sem convite em ${dataHora(e.criado_em)} · ainda não começou`;
  return `Convite de ${dataHora(e.convidado_em ?? e.criado_em)}${e.convidado_por ? `, por ${e.convidado_por}` : ''} · ainda não começou`;
}

/**
 * O rótulo da situação como a tela mostra. "Em andamento" é só enquanto a pessoa está na ligação com a Maia
 * (decisão 69); fora da ligação, a entrevista aberta está pausada (ou esperando o complemento). Um convite sem
 * e-mail fica avisado.
 */
export function situacaoDaEntrevista(e: { status: StatusEntrevista; falas: number; em_ligacao?: boolean; arquivado_em?: string | null; convidado_em?: string | null; convite_enviado_em?: string | null; complemento_pendencias?: number | null }) {
  if (e.arquivado_em) return 'Arquivada';
  if (e.status === 'convidada' && e.convidado_em === null) return 'Ainda não começou'; // aberta sem convite (decisão 74)
  if (e.status === 'convidada') return e.convite_enviado_em ? 'Convite enviado' : 'Convite sem e-mail';
  if (e.status === 'em_andamento' && e.em_ligacao) return 'Em andamento';
  if (e.status === 'em_andamento' && e.complemento_pendencias) return `Completar: ${e.complemento_pendencias} ${e.complemento_pendencias === 1 ? 'ponto' : 'pontos'}`;
  if (e.status === 'em_andamento') return 'Pausada';
  if (e.status === 'processando') return 'Gerando o resultado';
  if (e.status === 'concluida') return 'Concluída';
  return 'Erro ao gerar o resultado';
}
