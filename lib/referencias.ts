// Referências entre POPs e processos (decisão 35). Um documento cita outro dentro do texto rico, com
// um tipo de relação; o destino é guardado por id e o nome é resolvido na hora de mostrar.
// Este módulo não depende do navegador nem do servidor: o editor, as páginas públicas, o DOCX e o
// PDF usam os mesmos rótulos e cores.

export type TipoDoc = 'pop' | 'processo';
export type Relacao = 'proxima' | 'anterior' | 'depende' | 'consulta';

// Ícones (Tabler, 24×24, traço): arrow-narrow-right-dashed, arrow-narrow-left-dashed, alert-triangle e arrow-bear-right.
export const RELACOES: Record<Relacao, { rotulo: string; inverso: string; cor: string; fundo: string; icone: string }> = {
  proxima: { rotulo: 'Próxima etapa', inverso: 'Próxima etapa de', cor: '#1E8449', fundo: '#E8F5EC', icone: 'M5 12h.5m3 0h1.5m3 0h6M15 16l4 -4M15 8l4 4' },
  anterior: { rotulo: 'Etapa anterior', inverso: 'Etapa anterior de', cor: '#5F6B6D', fundo: '#EEF2F3', icone: 'M5 12h6m3 0h1.5m3 0h.5M5 12l4 4M5 12l4 -4' },
  depende: { rotulo: 'Depende de', inverso: 'Pré-requisito de', cor: '#B45309', fundo: '#FFF4E0', icone: 'M12 9v4M10.363 3.591l-8.106 13.534a1.914 1.914 0 0 0 1.636 2.871h16.214a1.914 1.914 0 0 0 1.636 -2.87l-8.106 -13.536a1.914 1.914 0 0 0 -3.274 0M12 16h.01' },
  consulta: { rotulo: 'Consulta', inverso: 'Consultado em', cor: '#1F4E79', fundo: '#E8F0F8', icone: 'M12 3h5v5M17 3l-7.536 7.536a5 5 0 0 0 -1.464 3.534v6.93' },
};

/** O ícone da relação como SVG (para HTML montado em texto, como o da página pública). */
export const svgRelacao = (r: Relacao, tamanho = 14) =>
  `<svg class="ref-icone" width="${tamanho}" height="${tamanho}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${RELACOES[r].icone}"/></svg>`;
export const ORDEM_RELACOES: Relacao[] = ['proxima', 'anterior', 'depende', 'consulta'];
export const TIPOS_DOC: Record<TipoDoc, string> = { pop: 'POP', processo: 'Processo' };

export type Doc = { tipo: TipoDoc; id: string };
export type Ref = Doc & { relacao: Relacao };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const ehTipo = (t: unknown): t is TipoDoc => t === 'pop' || t === 'processo';
export const ehRelacao = (r: unknown): r is Relacao => typeof r === 'string' && r in RELACOES;

/** Lê os atributos data-ref ("pop:<id>") e data-rel do HTML; qualquer coisa fora do formato é ignorada. */
export function lerRef(dataRef: string | null | undefined, dataRel: string | null | undefined): Ref | null {
  const m = dataRef?.match(/^(pop|processo):([0-9a-f-]{36})$/i);
  if (!m || !UUID.test(m[2])) return null;
  return { tipo: m[1].toLowerCase() as TipoDoc, id: m[2].toLowerCase(), relacao: ehRelacao(dataRel) ? dataRel : 'consulta' };
}

export const chaveRef = (r: { tipo: TipoDoc; id: string }) => `${r.tipo}:${r.id}`;

/** Como o documento é chamado numa referência: "POP MKT-002 · Aprovação de Pagamento" ou "Processo Q8A6-JCA2 · Pagamento de Boletos". */
export function rotuloDoc(d: { tipo: TipoDoc; nome: string; identificacao?: string | null; codigo?: string | null }) {
  const id = d.tipo === 'pop' ? d.identificacao || d.codigo : d.codigo;
  return `${TIPOS_DOC[d.tipo]}${id ? ` ${id}` : ''} · ${d.nome}`;
}

/** Situação do destino, para o chip e para a página pública. */
export type Situacao = 'ok' | 'arquivado' | 'nao_publicado' | 'offline' | 'excluido';
export const SITUACAO: Record<Situacao, string> = {
  ok: '',
  arquivado: 'arquivado',
  nao_publicado: 'não publicado',
  offline: 'página pública desligada',
  excluido: 'documento excluído',
};

/** Um destino resolvido (nome atual, situação e links). */
export type ReferenciaResolvida = {
  tipo: TipoDoc;
  id: string;
  nome: string;
  identificacao: string | null;
  codigo: string | null;
  rotulo: string;
  situacao: Situacao;
  /** A página pública está no ar (publicado, ligada e não arquivada). */
  publico: boolean;
  url_app: string;
  url_publica: string | null;
};

export type ReferenciadoEm = ReferenciaResolvida & { relacoes: Relacao[] };

/** Resultado da busca para inserir uma referência. */
export type ResultadoBusca = { tipo: TipoDoc; id: string; nome: string; identificacao: string | null; codigo: string; rotulo: string; onde: string };

/** Texto de uma referência num documento (PDF, DOCX): "Próxima etapa: POP MKT-002 · Nome". */
export const textoReferencia = (relacao: Relacao, rotulo: string) => `${RELACOES[relacao].rotulo}: ${rotulo}`;

/** Parâmetro ?de= das páginas públicas: de onde a pessoa veio ("p:<link>" ou "pr:<link>"). */
export function lerOrigemPublica(de: string | null | undefined): { tipo: 'p' | 'pr'; link: string } | null {
  const m = de?.match(/^(p|pr):([a-z0-9]{32})$/);
  return m ? { tipo: m[1] as 'p' | 'pr', link: m[2] } : null;
}
export const comOrigem = (url: string, de: { tipo: 'p' | 'pr'; link: string } | null) => (de ? `${url}?de=${de.tipo}:${de.link}` : url);
