// Arquivos anexados ao POP (decisão 141): o que o navegador e o servidor têm em comum (tipos, situação pela validade,
// como cada formato é mostrado) e as chamadas do navegador à API. "Anexo" é o nome no código, para não confundir com
// "arquivar"; na tela é sempre "arquivo".
import { ErroCliente } from './fluxogramas';

/** Situação do arquivo pela validade. */
export type Situacao = 'vigente' | 'vencendo' | 'expirado';
export const SITUACOES: Situacao[] = ['vigente', 'vencendo', 'expirado'];
export const ROTULO_SITUACAO: Record<Situacao, string> = { vigente: 'Vigente', vencendo: 'Próximo do vencimento', expirado: 'Expirado' };

export const TAMANHO_MAXIMO = 50 * 1024 * 1024; // o limite do bucket no Storage
export const MAX_NOME = 200;
export const MIN_DESCRICAO = 3;
export const MAX_DESCRICAO = 200;
export const AVISAR_PADRAO = 30; // dias antes da validade em que o arquivo passa a "Próximo do vencimento"
export const MAX_AVISAR = 365;
export const MAX_ARQUIVOS_POR_ETAPA = 50;

/** O cadastro de um arquivo do POP. O endereço para abrir é pedido na hora (`abrirArquivo`), nunca vem na lista. */
export type Arquivo = {
  id: string; pop_id: string;
  nome: string; // o nome do arquivo, como foi enviado
  descricao: string;
  tipo: string; // MIME
  tamanho: number; // bytes
  /** Último dia em que pode ser usado (AAAA-MM-DD). Nula: sem validade definida. */
  validade: string | null;
  avisar_dias: number;
  criado_em: string; criado_por: string;
  situacao: Situacao;
};
/** O que as páginas de leitura (pública e de uma versão) recebem: só o que está valendo. */
export type ArquivoPublico = Pick<Arquivo, 'id' | 'nome' | 'descricao' | 'tipo' | 'tamanho' | 'validade'>;

/** Como o arquivo é mostrado dentro da plataforma. "outro": não há visualização, só o download. */
export type Visualizacao = 'pdf' | 'imagem' | 'video' | 'audio' | 'outro';
const IMAGENS = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/avif', 'image/bmp']);
const POR_EXTENSAO: Record<string, Visualizacao> = {
  pdf: 'pdf', png: 'imagem', jpg: 'imagem', jpeg: 'imagem', webp: 'imagem', gif: 'imagem', avif: 'imagem', bmp: 'imagem',
  mp4: 'video', webm: 'video', mov: 'video', m4v: 'video', ogv: 'video', mp3: 'audio', wav: 'audio', ogg: 'audio', m4a: 'audio',
};
export const extensaoDe = (nome: string) => nome.match(/\.([a-z0-9]{1,8})$/i)?.[1]?.toLowerCase() ?? '';
/** SVG e HTML nunca são mostrados dentro da plataforma (podem trazer script): só o download. */
export function visualizacaoDe(a: { tipo: string; nome: string }): Visualizacao {
  const tipo = a.tipo.toLowerCase().split(';')[0].trim();
  if (tipo === 'application/pdf') return 'pdf';
  if (IMAGENS.has(tipo)) return 'imagem';
  if (tipo.startsWith('video/')) return 'video';
  if (tipo.startsWith('audio/')) return 'audio';
  if (tipo && tipo !== 'application/octet-stream') return 'outro';
  return POR_EXTENSAO[extensaoDe(a.nome)] ?? 'outro';
}
const ROTULO_FORMATO: Record<Visualizacao, string> = { pdf: 'PDF', imagem: 'Imagem', video: 'Vídeo', audio: 'Áudio', outro: 'Arquivo' };
/** "PDF", "Imagem", "Vídeo" ou, para os outros, a extensão ("DOCX"). */
export const formatoDe = (a: { tipo: string; nome: string }) => {
  const v = visualizacaoDe(a);
  return v === 'outro' ? extensaoDe(a.nome).toUpperCase() || ROTULO_FORMATO.outro : ROTULO_FORMATO[v];
};

/** A data de hoje em Brasília (AAAA-MM-DD): a validade é contada em dias de lá. */
export const hojeEmBrasilia = (agora = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(agora);
const DIA = 24 * 60 * 60 * 1000;
/** Dias de `hoje` até a validade (0: vence hoje; negativo: já venceu). */
export const diasAte = (validade: string, hoje = hojeEmBrasilia()) => Math.round((Date.parse(`${validade}T00:00:00Z`) - Date.parse(`${hoje}T00:00:00Z`)) / DIA);
/**
 * A situação pela validade. O arquivo pode ser usado até o fim do dia da validade e expira no dia seguinte; fica
 * "Próximo do vencimento" quando faltam `avisarDias` dias ou menos.
 */
export function situacaoDe(validade: string | null, avisarDias: number, hoje = hojeEmBrasilia()): Situacao {
  if (!validade) return 'vigente';
  const dias = diasAte(validade, hoje);
  return dias < 0 ? 'expirado' : dias <= avisarDias ? 'vencendo' : 'vigente';
}
export const dataBr = (dia: string) => dia.slice(0, 10).split('-').reverse().join('/');
/** "Sem validade", "Até 31/12/2026" e, perto do fim, quanto falta. */
export function textoDaValidade(a: Pick<Arquivo, 'validade' | 'situacao'>, hoje = hojeEmBrasilia()) {
  if (!a.validade) return 'Sem validade';
  const dias = diasAte(a.validade, hoje);
  if (dias < 0) return `Venceu em ${dataBr(a.validade)}`;
  if (a.situacao !== 'vencendo') return `Até ${dataBr(a.validade)}`;
  return `Até ${dataBr(a.validade)} · ${dias === 0 ? 'vence hoje' : dias === 1 ? 'falta 1 dia' : `faltam ${dias} dias`}`;
}
export function tamanhoLegivel(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB`;
}
/** "Etapa 2: Conferência" (ou só "Etapa 2"). */
export const nomeDaEtapa = (ordem: number, nome: string) => `Etapa ${ordem}${nome.trim() ? `: ${nome.trim()}` : ''}`;

// --- Etapas: a ligação fica no conteúdo do POP, em `procedimentos[].arquivos` ---

type ComArquivos = { arquivos?: string[] };
/** As posições (a partir de 0) das etapas em que o arquivo está. */
export const etapasDoArquivo = (procedimentos: ComArquivos[], id: string) => procedimentos.flatMap((p, i) => (p.arquivos?.includes(id) ? [i] : []));
/** Liga o arquivo exatamente às etapas dadas (posições) e tira das outras. Etapa sem arquivo fica sem a lista. */
export function comArquivoNasEtapas<P extends ComArquivos>(procedimentos: P[], id: string, etapas: number[]): P[] {
  return procedimentos.map((p, i) => {
    const sem = (p.arquivos ?? []).filter((x) => x !== id);
    const lista = etapas.includes(i) ? [...sem, id] : sem;
    const { arquivos: _a, ...resto } = p;
    return (lista.length ? { ...resto, arquivos: lista } : resto) as P;
  });
}
/** Tira o arquivo de todas as etapas (ao excluir). */
export const semArquivo = <P extends ComArquivos>(procedimentos: P[], id: string) => comArquivoNasEtapas(procedimentos, id, []);

// --- Navegador ---

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, { ...init, headers: { 'content-type': 'application/json', ...init?.headers } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new ErroCliente(j.erro || `Erro ${r.status}`, r.status, j.codigo);
  return j as T;
}

export type DadosDoArquivo = { descricao: string; validade: string | null; avisar_dias: number };
/** Onde abrir o arquivo agora: `url` para mostrar na plataforma (nula se o formato não tem visualização) e `download`. */
export type Abertura = { url: string | null; download: string; visualizacao: Visualizacao };

/** PUT com progresso (o `fetch` não informa quanto já foi enviado). */
function enviar(url: string, arquivo: File, aoProgredir?: (fracao: number) => void) {
  return new Promise<void>((ok, falha) => {
    const x = new XMLHttpRequest();
    x.open('PUT', url);
    x.setRequestHeader('content-type', arquivo.type || 'application/octet-stream');
    x.upload.onprogress = (e) => { if (e.lengthComputable) aoProgredir?.(e.loaded / e.total); };
    x.onload = () => (x.status >= 200 && x.status < 300 ? ok() : falha(new ErroCliente(`Falha no envio (${x.status})`, x.status)));
    x.onerror = () => falha(new ErroCliente('Falha no envio. Confira a conexão e tente de novo.', 0));
    x.send(arquivo);
  });
}

/** Envia o arquivo direto ao Storage e registra no POP. */
export async function anexarArquivo(popId: string, arquivo: File, dados: DadosDoArquivo, aoProgredir?: (fracao: number) => void) {
  const base = `/api/pops/${popId}/arquivos`;
  const envio = await api<{ caminho: string; url: string }>(`${base}/envio`, { method: 'POST', body: JSON.stringify({ nome: arquivo.name, tamanho: arquivo.size }) });
  await enviar(envio.url, arquivo, aoProgredir);
  return api<Arquivo>(base, { method: 'POST', body: JSON.stringify({ ...dados, caminho: envio.caminho, nome: arquivo.name, tipo: arquivo.type, tamanho: arquivo.size }) });
}
export const editarArquivo = (popId: string, id: string, dados: DadosDoArquivo) =>
  api<Arquivo>(`/api/pops/${popId}/arquivos/${id}`, { method: 'PATCH', body: JSON.stringify(dados) });
export const excluirArquivo = (popId: string, id: string) => api<{ ok: true }>(`/api/pops/${popId}/arquivos/${id}`, { method: 'DELETE' });
/** O endereço para abrir o arquivo agora (dentro do app). O servidor recusa o arquivo expirado. */
export const abrirArquivo = (popId: string, id: string) => api<Abertura>(`/api/pops/${popId}/arquivos/${id}`);
/** O mesmo, na página pública do POP: só os arquivos da versão publicada. */
export const abrirArquivoPublico = (link: string, id: string) => api<Abertura>(`/api/publico/pops/${link}/arquivos/${id}`);

/** A central de arquivos do processo: os arquivos de cada POP, com as etapas em que estão. */
export type ArquivoDoProcesso = Arquivo & { etapas: number[] }; // ordens (a partir de 1) no POP
export type PopComArquivos = { id: string; nome: string; identificacao: string; etapas: { ordem: number; nome: string }[]; arquivos: ArquivoDoProcesso[] };
export const listarArquivosDoProcesso = (processoId: string) => api<{ pops: PopComArquivos[] }>(`/api/processos/${processoId}/arquivos`);
