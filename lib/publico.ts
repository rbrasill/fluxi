// Cliente das páginas públicas (decisão 32): a versão publicada do POP e o fluxograma do processo.
import { ErroCliente } from './fluxogramas';
import type { ConteudoPop, Historico } from './pop/schema';

type Onde = { organizacao: string | null; area: string | null; processo: string | null };

export type PopPublico = {
  nome: string; codigo: string; identificacao: string; versao: string; autor: string; criado_em: string; publicado_em: string;
  historico: Historico[]; conteudo: ConteudoPop;
  imagens: Record<string, string>; // link temporário de cada print (por imagem_caminho)
  onde: Onde;
  fluxograma: { link_publico: string; nome: string; tem_svg: boolean } | null;
};
export type FluxogramaPublico = { nome: string; codigo: string; tem_svg: boolean; atualizado_em: string; onde: Onde };

async function api<T>(url: string): Promise<T> {
  const r = await fetch(url);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new ErroCliente(j.erro || `Erro ${r.status}`, r.status);
  return j as T;
}

export const obterPopPublico = (link: string) => api<PopPublico>(`/api/publico/pops/${encodeURIComponent(link)}`);
export const obterFluxogramaPublico = (link: string) => api<FluxogramaPublico>(`/api/publico/fluxogramas/${encodeURIComponent(link)}`);
export const urlSvg = (link: string) => `/api/publico/fluxogramas/${encodeURIComponent(link)}/svg`;
export const urlDocumentoPublico = (link: string, formato: 'pdf' | 'docx') => `/api/publico/pops/${encodeURIComponent(link)}/${formato}`;

export const dataBr = (iso: string) => new Date(iso).toLocaleDateString('pt-BR');
