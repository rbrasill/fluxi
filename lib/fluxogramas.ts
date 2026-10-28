// Cliente da API de fluxogramas (usado pelas páginas).
import type { Fluxo } from './fluxo/schema';

export type FluxogramaResumo = {
  id: string;
  codigo: string;
  nome: string;
  origem: 'manual' | 'ia' | 'modelo';
  miniatura?: string | null;
  processo_id?: string | null;
  criado_em: string;
  atualizado_em: string;
};
/** `schema`: a estrutura que a IA devolveu (só nos fluxogramas gerados por IA). */
export type Fluxograma = FluxogramaResumo & { xml: string; schema?: Fluxo | null };

export class ErroCliente extends Error {
  constructor(message: string, public status: number, public codigo?: string) {
    super(message);
  }
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, { ...init, headers: { 'content-type': 'application/json', ...init?.headers } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new ErroCliente(j.erro || `Erro ${r.status}`, r.status, j.codigo);
  return j as T;
}

export const listar = () => api<FluxogramaResumo[]>('/api/fluxogramas');
export const obter = (id: string) => api<Fluxograma>(`/api/fluxogramas/${id}`);
export const criar = (nome: string, xml = '', origem: 'manual' = 'manual', processo_id?: string) =>
  api<FluxogramaResumo>('/api/fluxogramas', { method: 'POST', body: JSON.stringify({ nome, xml, origem, processo_id }) });
export const salvar = (id: string, dados: { nome?: string; xml?: string; miniatura?: string }, keepalive = false) =>
  api<{ id: string }>(`/api/fluxogramas/${id}`, { method: 'PATCH', body: JSON.stringify(dados), keepalive });
export const duplicar = (id: string) => api<FluxogramaResumo>(`/api/fluxogramas/${id}/duplicar`, { method: 'POST' });
export const excluir = (id: string) => api<{ ok: true }>(`/api/fluxogramas/${id}`, { method: 'DELETE' });

// IA
export const gerarComIa = (texto: string, origem: 'descricao' | 'transcricao', nome?: string, processo_id?: string) =>
  api<FluxogramaResumo>('/api/ia/fluxograma', { method: 'POST', body: JSON.stringify({ texto, origem, nome, processo_id }) });

const LIMITE_AUDIO_BYTES = 50 * 1024 * 1024; // limite por arquivo do Storage (Supabase Free)
const ESPERA_MAXIMA_MS = 30 * 60 * 1000;
const mmss = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, '0')}`;

/** Envia com progresso (fetch não informa o andamento do envio). */
function enviarComProgresso(url: string, arquivo: File, aoProgresso: (pct: number) => void) {
  return new Promise<void>((ok, falha) => {
    const x = new XMLHttpRequest();
    x.open('PUT', url);
    x.setRequestHeader('content-type', arquivo.type || 'application/octet-stream');
    x.setRequestHeader('x-upsert', 'false');
    x.upload.onprogress = (e) => e.lengthComputable && aoProgresso(Math.round((e.loaded / e.total) * 100));
    x.onload = () => (x.status < 300 ? ok() : falha(new ErroCliente(x.status === 413 ? 'O arquivo passa do limite de 50 MB.' : 'Falha ao enviar o áudio.', x.status)));
    x.onerror = () => falha(new ErroCliente('Falha ao enviar o áudio. Verifique a conexão.', 0));
    x.send(arquivo);
  });
}

export async function transcreverAudio(arquivo: File, aoMudar: (etapa: string) => void): Promise<string> {
  if (arquivo.size > LIMITE_AUDIO_BYTES) {
    const mb = (arquivo.size / 1024 / 1024).toFixed(0);
    throw new ErroCliente(`O arquivo tem ${mb} MB e o limite é 50 MB. Converta para MP3 ou M4A (bem menores que WAV) ou envie um trecho menor.`, 413);
  }
  aoMudar('Enviando áudio…');
  const up = await api<{ caminho: string; url: string }>('/api/transcricoes/upload', { method: 'POST', body: JSON.stringify({ nome: arquivo.name }) });
  await enviarComProgresso(up.url, arquivo, (pct) => aoMudar(`Enviando áudio… ${pct}%`));
  aoMudar('Transcrevendo…');
  const { id } = await api<{ id: string }>('/api/transcricoes', { method: 'POST', body: JSON.stringify({ caminho: up.caminho }) });
  const inicio = Date.now();
  let falhasSeguidas = 0;
  for (;;) {
    await new Promise((ok) => setTimeout(ok, 4000));
    const decorrido = Date.now() - inicio;
    if (decorrido > ESPERA_MAXIMA_MS) throw new ErroCliente('A transcrição está demorando mais que o normal. Tente de novo em alguns minutos.', 504);
    let t: { status: 'processando' | 'pronta' | 'erro'; texto?: string; erro?: string };
    try {
      t = await api(`/api/transcricoes/${id}`);
      falhasSeguidas = 0;
    } catch (e) {
      // Oscilação de rede não derruba a espera; só desiste depois de várias falhas seguidas.
      if (++falhasSeguidas >= 5) throw e;
      continue;
    }
    if (t.status === 'pronta') {
      if (!t.texto?.trim()) throw new ErroCliente('Não foi encontrada fala no áudio. Confira se o arquivo tem a narração do processo.', 422);
      return t.texto;
    }
    if (t.status === 'erro') throw new ErroCliente(`Erro na transcrição: ${t.erro}`, 502);
    aoMudar(`Transcrevendo… ${mmss(decorrido)}${decorrido > 90_000 ? ' · áudios longos levam alguns minutos' : ''}`);
  }
}

// Fluxogramas salvos no navegador pela versão de teste anterior.
const INDICE_LOCAL = 'fluxi:fluxogramas';
export function locaisPendentes(): { nome: string; xml: string; chave: string }[] {
  try {
    const itens: { id: string; nome: string }[] = JSON.parse(localStorage.getItem(INDICE_LOCAL) || '[]');
    return itens.map((f) => ({ nome: f.nome, xml: localStorage.getItem(`fluxi:fluxograma:${f.id}`) || '', chave: f.id }));
  } catch {
    return [];
  }
}
export async function importarLocais() {
  for (const f of locaisPendentes()) {
    await criar(f.nome, f.xml);
    localStorage.removeItem(`fluxi:fluxograma:${f.chave}`);
  }
  localStorage.removeItem(INDICE_LOCAL);
}
