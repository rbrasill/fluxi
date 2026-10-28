// Cliente da API de gravações.
import { ErroCliente } from './fluxogramas';
import type { Anotacoes } from './marcacao/anotacoes';
import type { OndePop } from './pops';

// 'gravando' sem a aba aberta = gravação não finalizada; 'pausada' = a pessoa escolheu continuar depois.
export type StatusGravacao = 'gravando' | 'pausada' | 'pronta' | 'interrompida' | 'erro';
export type GravacaoResumo = {
  id: string; nome: string; status: StatusGravacao; duracao_ms: number | null; processo_id?: string | null; processo?: OndePop;
  criado_em: string; atualizado_em?: string; total_marcacoes: number;
};
/** Dona de uma tela: a gravação em que foi marcada ou o POP em que foi anexada. */
export type DonoTela = { gravacao_id: string } | { pop_id: string };
const rotaTelas = (d: DonoTela) => ('gravacao_id' in d ? `/api/gravacoes/${d.gravacao_id}/marcacoes` : `/api/pops/${d.pop_id}/telas`);
export type SegmentoGravado = { indice: number; caminho: string; inicio_ms: number; duracao_ms: number; bytes: number; mime: string; url: string | null };
export type Marcacao = {
  id: string; tempo_ms: number; imagem_caminho: string; imagem_url: string | null; largura: number | null; altura: number | null;
  instrucao: string | null; instrucao_ia: string | null; incluir_no_pop: boolean;
  anotacoes: Anotacoes | null; imagem_anotada_url: string | null;
};
export type Fala = { falante: string; inicio_ms: number; texto: string };
export type Gravacao = Omit<GravacaoResumo, 'total_marcacoes' | 'processo'> & {
  largura: number | null; altura: number | null; segmentos: SegmentoGravado[]; marcacoes: Marcacao[];
  processamento: string; falas: Fala[]; processo: { id: string; nome: string; codigo: string } | null;
  /** POP ligado à gravação (gerado pela IA ou criado com as telas) e as telas que ele já usa. */
  pop: { id: string; nome: string; status: string; telas: string[] } | null;
};

/** Até onde a gravação foi: fim da última parte salva ou da última tela marcada (o que vier depois). */
export const tempoGravado = (g: Pick<Gravacao, 'segmentos' | 'marcacoes' | 'duracao_ms'>) =>
  Math.max(g.duracao_ms ?? 0, ...g.segmentos.map((s) => s.inicio_ms + s.duracao_ms), ...g.marcacoes.map((m) => m.tempo_ms));
/** Nome do status para a pessoa (gravação que ainda pode receber mais conteúdo). */
export const ROTULO_STATUS: Record<StatusGravacao, string> = { gravando: 'Não finalizada', pausada: 'Pausada', pronta: 'Pronta', interrompida: 'Interrompida', erro: 'Com erro no envio' };

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, { ...init, headers: { 'content-type': 'application/json', ...init?.headers } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new ErroCliente(j.erro || `Erro ${r.status}`, r.status, j.codigo);
  return j as T;
}
const json = (method: string, body: unknown): RequestInit => ({ method, body: JSON.stringify(body) });

export const listarGravacoes = () => api<GravacaoResumo[]>('/api/gravacoes');
export const obterGravacao = (id: string) => api<Gravacao>(`/api/gravacoes/${id}`);
export const criarGravacao = (nome: string, processo_id?: string) => api<{ id: string }>('/api/gravacoes', json('POST', { nome, processo_id }));
export const atualizarGravacao = (id: string, dados: Partial<{ nome: string; status: StatusGravacao; duracao_ms: number; largura: number; altura: number }>) =>
  api(`/api/gravacoes/${id}`, json('PATCH', dados));
export const excluirGravacao = (id: string) => api(`/api/gravacoes/${id}`, { method: 'DELETE' });
export const atualizarMarcacao = (id: string, mid: string, dados: { instrucao?: string | null; incluir_no_pop?: boolean }) =>
  api(`/api/gravacoes/${id}/marcacoes/${mid}`, json('PATCH', dados));
export const excluirMarcacao = (id: string, mid: string) => api(`/api/gravacoes/${id}/marcacoes/${mid}`, { method: 'DELETE' });

/** Envia um arquivo direto para o Storage (URL assinada) e devolve o caminho salvo. */
export async function enviarArquivo(dono: string | DonoTela, tipo: 'segmento' | 'imagem', blob: Blob, extensao: string) {
  const d: DonoTela = typeof dono === 'string' ? { gravacao_id: dono } : dono;
  const up = 'gravacao_id' in d
    ? await api<{ caminho: string; url: string }>(`/api/gravacoes/${d.gravacao_id}/upload`, json('POST', { tipo, extensao }))
    : await api<{ caminho: string; url: string }>(`/api/pops/${d.pop_id}/telas/upload`, json('POST', { extensao }));
  const r = await fetch(up.url, { method: 'PUT', body: blob, headers: { 'content-type': blob.type || 'application/octet-stream' } });
  if (!r.ok) throw new ErroCliente(`Falha no envio (${r.status})`, r.status);
  return up.caminho;
}

export const registrarSegmento = (id: string, s: Omit<SegmentoGravado, 'url'>) => api(`/api/gravacoes/${id}/segmentos`, json('POST', s));
export const registrarMarcacao = (id: string, m: { tempo_ms: number; imagem_caminho: string; instrucao?: string; largura?: number; altura?: number }) =>
  api<{ id: string }>(`/api/gravacoes/${id}/marcacoes`, json('POST', m));

export function formatarTempo(ms: number) {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export type EstadoProcessamento = {
  processamento: 'nenhum' | 'transcrevendo' | 'analisando' | 'pronto' | 'erro';
  erro: string | null;
  pop_id: string | null;
  fluxograma_id: string | null;
  segmentos: { total: number; prontos: number };
};
export const iniciarProcessamento = (id: string) => api<EstadoProcessamento>(`/api/gravacoes/${id}/processar`, { method: 'POST' });
export const consultarProcessamento = (id: string) => api<EstadoProcessamento>(`/api/gravacoes/${id}/processar`);

/**
 * Salva as marcações desenhadas numa tela: envia a imagem final ao Storage e registra.
 * Com `null`, remove as marcações e volta ao print original. Devolve o link da imagem marcada.
 */
export async function salvarMarcacaoDesenhada(
  dono: DonoTela, telaId: string,
  r: { anotacoes: Anotacoes; png: Blob; largura: number; altura: number } | null,
): Promise<string | null> {
  const url = `${rotaTelas(dono)}/${telaId}/anotacao`;
  if (!r) {
    await api(url, { method: 'DELETE' });
    return null;
  }
  const caminho = await enviarArquivo(dono, 'imagem', r.png, 'png');
  const j = await api<{ imagem_anotada_url: string | null }>(url, json('PUT', {
    anotacoes: r.anotacoes, imagem_anotada_caminho: caminho, largura: r.largura, altura: r.altura,
  }));
  return j.imagem_anotada_url;
}
