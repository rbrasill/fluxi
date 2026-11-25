// Cliente da API de processos (a "pasta" de cada processo).
import { ErroCliente } from './fluxogramas';
import type { IconeDoProcesso } from './icones';
import type { ReferenciaPublica } from './publico';
import type { ReferenciaResolvida, ReferenciadoEm } from './referencias';
import type { PedidoDePublicacao, TipoDeVersao, VersaoPublicada } from './versao';

export type ProcessoResumo = {
  id: string; codigo: string; nome: string; descricao: string; area_id: string; area: { id: string; nome: string; organizacao: { id: string; nome: string } | null } | null;
  arquivado_em: string | null; criado_em: string; atualizado_em: string; link_publico_ativo: boolean; // página pública no ar (decisão 35)
  icone: IconeDoProcesso | null; // ícone escolhido para o processo (decisão 133)
  total: { fluxogramas: number; gravacoes: number; pops: number };
};
export type Processo = Omit<ProcessoResumo, 'total'> & {
  link_publico: string; link_publico_ativo: boolean; // página pública /pr/<link> (decisão 35)
  publicado_em: string | null; alteracoes_nao_publicadas: boolean; // versão publicada (decisão 129)
  versoes: VersaoPublicada[]; // as versões publicadas, da mais nova para a mais antiga (decisão 139)
  referencias: Record<string, ReferenciaResolvida>; referenciado_em: ReferenciadoEm[];
  fluxograma: { id: string; codigo: string; nome: string; origem: string; miniatura: string | null; link_publico: string; tem_svg: boolean; atualizado_em: string } | null; // um por processo
  gravacoes: { id: string; nome: string; status: string; duracao_ms: number | null; processamento: string; criado_em: string; pop_nome: string | null; total_marcacoes: number }[];
  pops: { id: string; nome: string; codigo: string; identificacao: string; versao: string; status: string; link_publico_ativo: boolean; arquivado_em: string | null; atualizado_em: string }[];
};

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, { ...init, headers: { 'content-type': 'application/json', ...init?.headers } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new ErroCliente(j.erro || `Erro ${r.status}`, r.status, j.codigo);
  return j as T;
}

/** Processos ativos; com `arquivados`, só os arquivados. */
export const listarProcessos = (arquivados = false) => api<ProcessoResumo[]>(`/api/processos${arquivados ? '?arquivados=1' : ''}`);
export const obterProcesso = (id: string) => api<Processo>(`/api/processos/${id}`);
export const criarProcesso = (dados: { nome: string; area_id: string; descricao?: string }) =>
  api<ProcessoResumo>('/api/processos', { method: 'POST', body: JSON.stringify(dados) });
export const atualizarProcesso = (id: string, dados: { nome?: string; area_id?: string; descricao?: string }) =>
  api<{ id: string }>(`/api/processos/${id}`, { method: 'PATCH', body: JSON.stringify(dados) });
/** Arquiva (some das listas com tudo o que tem; nada é apagado) e restaura. */
export const arquivarProcesso = (id: string) => api(`/api/processos/${id}/arquivar`, { method: 'POST' });
export const restaurarProcesso = (id: string) => api(`/api/processos/${id}/restaurar`, { method: 'POST' });
/** Copia o processo para uma área (decisão 36), com a descrição, o fluxograma e cópias dos POPs ativos. */
export const copiarProcesso = (id: string, dados: { area_id: string; nome?: string }) =>
  api<{ id: string; pops: number; fluxograma: boolean }>(`/api/processos/${id}/copiar`, { method: 'POST', body: JSON.stringify(dados) });
/** Escolhe o ícone do processo (decisão 133); com `nome` nulo, tira o ícone. */
export const definirIconeDoProcesso = (id: string, nome: string | null, cor: number | null) =>
  api<{ icone: IconeDoProcesso | null }>(`/api/processos/${id}/icone`, { method: 'PUT', body: JSON.stringify({ nome, cor }) });
/**
 * Publica o processo como uma versão nova (decisões 129 e 139): a página pública passa a mostrar esta versão. A
 * primeira publicação é a 1.0.0; nas seguintes vão o tamanho da alteração e o que mudou.
 */
export const publicarProcesso = (id: string, pedido: PedidoDePublicacao = {}) =>
  api<{ publicado_em: string; versao: string; versoes: VersaoPublicada[] }>(`/api/processos/${id}/publicar`, { method: 'POST', body: JSON.stringify(pedido) });
/** Uma versão publicada do processo, como saiu naquele dia (só leitura), e a imagem do fluxograma dela. */
export type VersaoPublicadaDoProcesso = {
  nome: string; codigo: string; descricao: string; versao: string; publicado_em: string;
  onde: { organizacao: string | null; area: string | null; processo: string | null };
  fluxograma: { nome: string; tem_svg: boolean } | null;
  referencias: Record<string, ReferenciaPublica>;
  desta_versao: { tipo: TipoDeVersao; o_que_mudou: string; publicado_por: string; versao_atual: string; processo_nome: string };
};
export const obterVersaoDoProcesso = (id: string, versao: string) => api<VersaoPublicadaDoProcesso>(`/api/processos/${id}/versoes/${encodeURIComponent(versao)}`);
export const urlSvgDaVersaoDoProcesso = (id: string, versao: string) => `/api/processos/${id}/versoes/${encodeURIComponent(versao)}/svg`;
/** Liga (online) ou desliga (offline) a página pública do processo (só depois de publicado). */
export const definirLinkPublicoProcesso = (id: string, ativo: boolean) =>
  api<{ link_publico_ativo: boolean }>(`/api/processos/${id}/link-publico`, { method: 'PUT', body: JSON.stringify({ ativo }) });
/** Só processo arquivado: apaga com os POPs, gravações e fluxograma dele. */
export const excluirProcesso = (id: string) => api(`/api/processos/${id}`, { method: 'DELETE' });

/** Move um item para um processo (ou tira de todos, com null). */
export const moverParaProcesso = (tipo: 'fluxogramas' | 'gravacoes' | 'pops', id: string, processo_id: string | null) =>
  api(`/api/${tipo}/${id}`, { method: 'PATCH', body: JSON.stringify({ processo_id }) });
