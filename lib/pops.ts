// Cliente da API de POPs.
import { ErroCliente } from './fluxogramas';
import type { Anotacoes } from './marcacao/anotacoes';
import { enviarArquivo } from './gravacoes';
import type { ConteudoPop, Historico, Posicao } from './pop/schema';

export type OndePop = { id: string; nome: string; area: { id: string; nome: string; organizacao: { id: string; nome: string } | null } | null } | null;
export type StatusPop = 'rascunho' | 'publicado';
export type PopResumo = {
  id: string; nome: string; codigo: string; identificacao: string; versao: string; status: StatusPop; autor: string;
  posicao: Posicao | null; // onde a pessoa parou no editor
  processo: OndePop;
  fluxograma_id: string | null; gravacao_id: string | null; processo_id: string | null; criado_em: string; atualizado_em: string;
};
export type TelaDoPop = { gravacao_id: string | null; pop_id: string | null; imagem_url: string | null; largura: number | null; altura: number | null; anotacoes: Anotacoes | null };
export type Pop = PopResumo & { conteudo: ConteudoPop; historico: Historico[]; imagens: Record<string, string>; telas: Record<string, TelaDoPop> };

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, { ...init, headers: { 'content-type': 'application/json', ...init?.headers } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new ErroCliente(j.erro || `Erro ${r.status}`, r.status, j.codigo);
  return j as T;
}

export const listarPops = () => api<PopResumo[]>('/api/pops');
export const obterPop = (id: string) => api<Pop>(`/api/pops/${id}`);
export const criarPop = (dados: { nome?: string; gravacao_id?: string; fluxograma_id?: string; processo_id?: string }) =>
  api<{ id: string }>('/api/pops', { method: 'POST', body: JSON.stringify(dados) });
export const salvarPop = (id: string, dados: Partial<Pick<Pop, 'nome' | 'identificacao' | 'versao' | 'autor' | 'conteudo' | 'historico' | 'posicao' | 'fluxograma_id' | 'status' | 'processo_id'>>, keepalive = false) =>
  api<{ id: string }>(`/api/pops/${id}`, { method: 'PATCH', body: JSON.stringify(dados), keepalive });
export const excluirPop = (id: string) => api(`/api/pops/${id}`, { method: 'DELETE' });
/** Move o POP para outra área, com o processo inteiro dele (POP sem processo: entra num processo da área). */
export const moverPop = (id: string, dados: { area_id: string; processo_id?: string; novo_processo?: string }) =>
  api<{ processo_id: string }>(`/api/pops/${id}/mover`, { method: 'POST', body: JSON.stringify(dados) });
export const urlDocx = (id: string) => `/api/pops/${id}/docx`;
export const urlPdf = (id: string) => `/api/pops/${id}/pdf`;

/** "Organização · Área · Processo" de um POP (ou aviso de que está sem processo). */
export function ondeEsta(p: { processo: OndePop }) {
  const pr = p.processo;
  if (!pr) return 'Sem processo';
  return [pr.area?.organizacao?.nome, pr.area?.nome, pr.nome].filter(Boolean).join(' · ');
}

export const dataCurta = (iso: string) => new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

// --- Prints anexados direto no POP ---

/** Envia o print ao Storage e registra como tela do POP. Devolve a tela, pronta para entrar num passo. */
export async function anexarPrint(popId: string, png: Blob, largura: number, altura: number) {
  const caminho = await enviarArquivo({ pop_id: popId }, 'imagem', png, 'png');
  const { id } = await api<{ id: string }>(`/api/pops/${popId}/telas`, { method: 'POST', body: JSON.stringify({ imagem_caminho: caminho, largura, altura }) });
  return { id, imagem_caminho: caminho, largura, altura, url: URL.createObjectURL(png) };
}
export const excluirTelaDoPop = (popId: string, telaId: string) => api(`/api/pops/${popId}/telas/${telaId}`, { method: 'DELETE' });
/** Leva para o POP as telas de uma gravação que ainda não estão nele. */
export const adicionarTelasDaGravacao = (popId: string, gravacaoId: string) =>
  api<{ adicionadas: number }>(`/api/pops/${popId}/telas/da-gravacao`, { method: 'POST', body: JSON.stringify({ gravacao_id: gravacaoId }) });
