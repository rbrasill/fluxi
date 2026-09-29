// Cliente da API de fluxogramas (usado pelas páginas).
export type FluxogramaResumo = {
  id: string;
  codigo: string;
  nome: string;
  origem: 'manual' | 'ia' | 'modelo';
  miniatura?: string | null;
  criado_em: string;
  atualizado_em: string;
};
export type Fluxograma = FluxogramaResumo & { xml: string };

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
export const criar = (nome: string, xml = '', origem: 'manual' | 'modelo' = 'manual') =>
  api<FluxogramaResumo>('/api/fluxogramas', { method: 'POST', body: JSON.stringify({ nome, xml, origem }) });
export const salvar = (id: string, dados: { nome?: string; xml?: string; miniatura?: string }, keepalive = false) =>
  api<{ id: string }>(`/api/fluxogramas/${id}`, { method: 'PATCH', body: JSON.stringify(dados), keepalive });
export const duplicar = (id: string) => api<FluxogramaResumo>(`/api/fluxogramas/${id}/duplicar`, { method: 'POST' });
export const excluir = (id: string) => api<{ ok: true }>(`/api/fluxogramas/${id}`, { method: 'DELETE' });

// IA
export const creditos = () => api<{ creditos: number }>('/api/ia/creditos');
export const gerarComIa = (texto: string, origem: 'descricao' | 'transcricao', nome?: string) =>
  api<FluxogramaResumo & { creditos: number }>('/api/ia/fluxograma', { method: 'POST', body: JSON.stringify({ texto, origem, nome }) });

export async function transcreverAudio(arquivo: File, aoMudar: (etapa: string) => void): Promise<string> {
  aoMudar('Enviando áudio…');
  const up = await api<{ caminho: string; url: string }>('/api/transcricoes/upload', { method: 'POST', body: JSON.stringify({ nome: arquivo.name }) });
  const r = await fetch(up.url, { method: 'PUT', body: arquivo, headers: { 'content-type': arquivo.type || 'application/octet-stream', 'x-upsert': 'false' } });
  if (!r.ok) throw new ErroCliente('Falha ao enviar o áudio.', r.status);
  aoMudar('Transcrevendo…');
  const { id } = await api<{ id: string }>('/api/transcricoes', { method: 'POST', body: JSON.stringify({ caminho: up.caminho }) });
  for (;;) {
    await new Promise((ok) => setTimeout(ok, 4000));
    const t = await api<{ status: 'processando' | 'pronto' | 'erro'; texto?: string; erro?: string }>(`/api/transcricoes/${id}`);
    if (t.status === 'pronto') return t.texto || '';
    if (t.status === 'erro') throw new ErroCliente(`Erro na transcrição: ${t.erro}`, 502);
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
