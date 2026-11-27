import 'server-only';
import { MAX_AVISAR, MAX_DESCRICAO, MAX_NOME, MIN_DESCRICAO, TAMANHO_MAXIMO, extensaoDe, hojeEmBrasilia, situacaoDe, tamanhoLegivel, visualizacaoDe, type Abertura, type Arquivo, type ArquivoPublico, type DadosDoArquivo, type PopComArquivos } from '@/lib/anexos';
import type { ConteudoPop } from '@/lib/pop/schema';
import { ErroApi } from './http';
import { TENANT_PADRAO, supabase } from './supabase';
import { BUCKET } from './telas';

// Arquivos anexados ao POP (decisão 141): o cadastro fica em `pop_arquivos` e o arquivo, no Storage, na pasta do POP.
// A ligação com as etapas fica no conteúdo do POP (`procedimentos[].arquivos`). Não há versões nem histórico do
// arquivo: cada atualização é um arquivo novo. O arquivo expirado continua guardado e listado, mas ninguém o abre.

const TABELA = 'pop_arquivos';
const CAMPOS = 'id, pop_id, nome, descricao, caminho, tipo, tamanho, validade, avisar_dias, criado_por, criado_em';
const URL_VALIDADE_S = 60 * 60 * 2;
type Linha = Omit<Arquivo, 'situacao'> & { caminho: string };

export const pastaDe = (popId: string) => `tenants/${TENANT_PADRAO}/pops/${popId}/arquivos/`;
const paraFora = ({ caminho: _c, ...l }: Linha, hoje = hojeEmBrasilia()): Arquivo => ({ ...l, tamanho: Number(l.tamanho), situacao: situacaoDe(l.validade, l.avisar_dias, hoje) });
/** A tabela ainda não existe (migração 0033 não aplicada): o resto do POP continua funcionando, sem arquivos. */
const semTabela = (e: { code?: string } | null) => e?.code === '42P01' || e?.code === 'PGRST205';

async function linhas(popIds: string[]): Promise<Linha[]> {
  if (!popIds.length) return [];
  const { data, error } = await supabase().from(TABELA).select(CAMPOS).eq('tenant_id', TENANT_PADRAO).in('pop_id', popIds).order('criado_em');
  if (semTabela(error)) return [];
  if (error) throw error;
  return (data ?? []) as unknown as Linha[];
}

async function linha(popId: string, id: string): Promise<Linha> {
  const { data, error } = await supabase().from(TABELA).select(CAMPOS).eq('tenant_id', TENANT_PADRAO).eq('pop_id', popId).eq('id', id).maybeSingle();
  if (error && !semTabela(error)) throw error;
  if (!data) throw new ErroApi(404, 'Arquivo não encontrado.');
  return data as unknown as Linha;
}

/** O POP existe e pode ser alterado (não está arquivado, nem o processo dele). */
async function popEditavel(popId: string) {
  const { data, error } = await supabase().from('pops').select('id, arquivado_em, processo:processos(arquivado_em)').eq('tenant_id', TENANT_PADRAO).eq('id', popId).maybeSingle();
  if (error) throw error;
  if (!data) throw new ErroApi(404, 'POP não encontrado');
  if (data.arquivado_em || (data.processo as unknown as { arquivado_em: string | null } | null)?.arquivado_em) throw new ErroApi(409, 'O POP está arquivado: restaure-o antes de mexer nos arquivos.');
}

/** Todos os arquivos do POP, do mais antigo ao mais novo, com a situação de hoje. */
export const doPop = async (popId: string) => (await linhas([popId])).map((l) => paraFora(l));

function validar(d: DadosDoArquivo): DadosDoArquivo {
  const descricao = d.descricao.replace(/\s+/g, ' ').trim();
  if (descricao.length < MIN_DESCRICAO) throw new ErroApi(400, 'Descreva o arquivo: o que ele é e para que serve.');
  if (descricao.length > MAX_DESCRICAO) throw new ErroApi(400, `A descrição pode ter até ${MAX_DESCRICAO} caracteres.`);
  if (d.validade !== null && (!/^\d{4}-\d{2}-\d{2}$/.test(d.validade) || Number.isNaN(Date.parse(`${d.validade}T00:00:00Z`)))) throw new ErroApi(400, 'Data de validade inválida.');
  if (!Number.isInteger(d.avisar_dias) || d.avisar_dias < 0 || d.avisar_dias > MAX_AVISAR) throw new ErroApi(400, `O aviso de vencimento vai de 0 a ${MAX_AVISAR} dias.`);
  return { descricao, validade: d.validade, avisar_dias: d.avisar_dias };
}

/** Endereço assinado para o navegador enviar o arquivo direto ao Storage. */
export async function urlDeEnvio(popId: string, p: { nome: string; tamanho: number }) {
  await popEditavel(popId);
  if (p.tamanho <= 0) throw new ErroApi(400, 'O arquivo está vazio.');
  if (p.tamanho > TAMANHO_MAXIMO) throw new ErroApi(413, `O arquivo tem ${tamanhoLegivel(p.tamanho)}. O limite é ${tamanhoLegivel(TAMANHO_MAXIMO)}.`);
  const ext = extensaoDe(p.nome).replace(/[^a-z0-9]/g, '') || 'bin';
  const caminho = `${pastaDe(popId)}${crypto.randomUUID()}.${ext}`;
  const { data, error } = await supabase().storage.from(BUCKET).createSignedUploadUrl(caminho);
  if (error) throw error;
  return { caminho, url: data.signedUrl };
}

/** Registra o arquivo que o navegador acabou de enviar. O tamanho e o tipo que valem são os que o Storage recebeu. */
export async function criar(popId: string, p: DadosDoArquivo & { caminho: string; nome: string; tipo: string; tamanho: number }, pessoa: { id: string; nome: string } | null) {
  await popEditavel(popId);
  if (!p.caminho.startsWith(pastaDe(popId)) || p.caminho.includes('..')) throw new ErroApi(400, 'Caminho de arquivo inválido');
  const dados = validar(p);
  const nome = p.nome.replace(/[\\/\u0000-\u001f]+/g, ' ').trim().slice(0, MAX_NOME);
  if (!nome) throw new ErroApi(400, 'O arquivo precisa de um nome.');
  const db = supabase();
  const { data: info, error: e1 } = await db.storage.from(BUCKET).info(p.caminho);
  if (e1 || !info) throw new ErroApi(400, 'O arquivo não chegou ao armazenamento. Envie de novo.');
  const tamanho = Number(info.size ?? p.tamanho) || 0;
  if (tamanho > TAMANHO_MAXIMO) {
    await db.storage.from(BUCKET).remove([p.caminho]);
    throw new ErroApi(413, `O limite é ${tamanhoLegivel(TAMANHO_MAXIMO)} por arquivo.`);
  }
  const { data, error } = await db.from(TABELA).insert({
    tenant_id: TENANT_PADRAO, pop_id: popId, nome, ...dados, caminho: p.caminho, tipo: (info.contentType || p.tipo || '').slice(0, 120), tamanho,
    criado_por: pessoa?.nome ?? '', criado_por_id: pessoa?.id ?? null,
  }).select(CAMPOS).single();
  if (error) {
    // Já registrado: o arquivo no armazenamento é do cadastro que existe, e fica. Nos outros erros, não sobra órfão.
    if (error.code === '23505') throw new ErroApi(409, 'Este arquivo já foi anexado.');
    await db.storage.from(BUCKET).remove([p.caminho]);
    if (semTabela(error)) throw new ErroApi(503, 'Os arquivos do POP ainda não estão disponíveis: falta aplicar a migração 0033 no banco.');
    throw error;
  }
  return paraFora(data as unknown as Linha);
}

export async function atualizar(popId: string, id: string, p: DadosDoArquivo) {
  await popEditavel(popId);
  const { data, error } = await supabase().from(TABELA).update({ ...validar(p), atualizado_em: new Date().toISOString() })
    .eq('tenant_id', TENANT_PADRAO).eq('pop_id', popId).eq('id', id).select(CAMPOS).maybeSingle();
  if (error) throw error;
  if (!data) throw new ErroApi(404, 'Arquivo não encontrado.');
  return paraFora(data as unknown as Linha);
}

/** Tira das etapas os arquivos que não estão em `existentes`; a etapa que fica sem nenhum perde a lista. */
export function soArquivosExistentes(conteudo: ConteudoPop, existentes: Set<string>): ConteudoPop {
  if (!conteudo.procedimentos.some((p) => p.arquivos)) return conteudo;
  return {
    ...conteudo,
    procedimentos: conteudo.procedimentos.map((p) => {
      if (!p.arquivos) return p;
      const { arquivos, ...resto } = p;
      const validos = [...new Set(arquivos)].filter((x) => existentes.has(x));
      return validos.length ? { ...resto, arquivos: validos } : resto;
    }),
  };
}

/** Exclui o arquivo: sai do Storage, do cadastro e das etapas do POP. Some na hora de todo lugar, inclusive da página pública. */
export async function excluir(popId: string, id: string) {
  await popEditavel(popId);
  const db = supabase();
  const l = await linha(popId, id);
  const { error } = await db.from(TABELA).delete().eq('tenant_id', TENANT_PADRAO).eq('pop_id', popId).eq('id', id);
  if (error) throw error;
  await db.storage.from(BUCKET).remove([l.caminho]);
  const { data: pop } = await db.from('pops').select('conteudo').eq('tenant_id', TENANT_PADRAO).eq('id', popId).maybeSingle();
  const conteudo = pop?.conteudo as ConteudoPop | undefined;
  if (conteudo?.procedimentos?.some((p) => p.arquivos?.includes(id))) {
    const restantes = new Set(conteudo.procedimentos.flatMap((p) => p.arquivos ?? []).filter((x) => x !== id));
    await db.from('pops').update({ conteudo: soArquivosExistentes(conteudo, restantes) }).eq('tenant_id', TENANT_PADRAO).eq('id', popId);
  }
  return { ok: true as const };
}

/** Os endereços (temporários) para abrir o arquivo agora. O expirado não abre para ninguém. */
async function abrirLinha(l: Linha): Promise<Abertura> {
  if (paraFora(l).situacao === 'expirado') throw new ErroApi(410, 'Este arquivo expirou e não pode mais ser aberto.', 'expirado');
  const visualizacao = visualizacaoDe(l);
  const armazenamento = supabase().storage.from(BUCKET);
  const [ver, baixar] = await Promise.all([
    visualizacao === 'outro' ? null : armazenamento.createSignedUrl(l.caminho, URL_VALIDADE_S),
    armazenamento.createSignedUrl(l.caminho, URL_VALIDADE_S, { download: l.nome }),
  ]);
  if (baixar.error || !baixar.data) throw new ErroApi(404, 'O arquivo não foi encontrado no armazenamento.');
  return { url: ver?.data?.signedUrl ?? null, download: baixar.data.signedUrl, visualizacao };
}
export const abrir = async (popId: string, id: string) => abrirLinha(await linha(popId, id));

/**
 * O que as páginas de leitura mostram: dos arquivos de uma versão publicada (`publicados`, com o nome e a descrição
 * daquele dia), só os que ainda existem e não expiraram. O tipo, o tamanho e a validade são os de agora.
 */
export async function paraLeitura(popId: string, publicados: { id: string; nome: string; descricao: string }[] | undefined): Promise<ArquivoPublico[]> {
  if (!publicados?.length) return [];
  const vivos = new Map((await doPop(popId)).filter((a) => a.situacao !== 'expirado').map((a) => [a.id, a]));
  return publicados.flatMap((p) => {
    const a = vivos.get(p.id);
    return a ? [{ id: a.id, nome: p.nome, descricao: p.descricao, tipo: a.tipo, tamanho: a.tamanho, validade: a.validade }] : [];
  });
}

/** A central de arquivos do processo: os arquivos dos POPs ativos, com as etapas (do conteúdo atual) em que estão. */
export async function doProcesso(processoId: string): Promise<{ pops: PopComArquivos[] }> {
  const { data, error } = await supabase().from('pops').select('id, nome, identificacao, conteudo, criado_em')
    .eq('tenant_id', TENANT_PADRAO).eq('processo_id', processoId).is('arquivado_em', null).order('criado_em');
  if (error) throw error;
  const pops = (data ?? []) as unknown as { id: string; nome: string; identificacao: string; conteudo: ConteudoPop }[];
  const todas = await linhas(pops.map((p) => p.id));
  const hoje = hojeEmBrasilia();
  return {
    pops: pops.flatMap((p) => {
      const procedimentos = p.conteudo?.procedimentos ?? [];
      const arquivos = todas.filter((l) => l.pop_id === p.id).map((l) => ({ ...paraFora(l, hoje), etapas: procedimentos.flatMap((e, i) => (e.arquivos?.includes(l.id) ? [i + 1] : [])) }));
      return arquivos.length ? [{ id: p.id, nome: p.nome, identificacao: p.identificacao, etapas: procedimentos.map((e, i) => ({ ordem: i + 1, nome: e.nome.trim() })), arquivos }] : [];
    }),
  };
}

/**
 * Copia os arquivos de um POP para outro (ao copiar o POP): arquivo e cadastro novos, com a mesma descrição e
 * validade. Devolve de qual id veio cada id novo, para refazer a ligação com as etapas.
 */
export async function copiarParaPop(origemId: string, destinoId: string, pessoa: string) {
  const db = supabase();
  const novos = new Map<string, string>();
  for (const l of await linhas([origemId])) {
    const caminho = `${pastaDe(destinoId)}${crypto.randomUUID()}.${extensaoDe(l.caminho) || 'bin'}`;
    const { error: e1 } = await db.storage.from(BUCKET).copy(l.caminho, caminho);
    if (e1) { console.warn(`cópia do POP ${destinoId}: arquivo ${l.id} não foi copiado (${e1.message})`); continue; }
    const { data, error } = await db.from(TABELA).insert({
      tenant_id: TENANT_PADRAO, pop_id: destinoId, nome: l.nome, descricao: l.descricao, caminho, tipo: l.tipo, tamanho: l.tamanho, validade: l.validade, avisar_dias: l.avisar_dias, criado_por: pessoa || l.criado_por,
    }).select('id').single();
    if (error) { await db.storage.from(BUCKET).remove([caminho]); console.warn(`cópia do POP ${destinoId}: arquivo ${l.id} não foi registrado (${error.message})`); continue; }
    novos.set(l.id, data.id as string);
  }
  return novos;
}

/** Apaga do Storage os arquivos do POP (ao excluir o POP; o cadastro sai junto com ele). */
export async function removerDoStorage(popId: string) {
  const caminhos = (await linhas([popId])).map((l) => l.caminho);
  if (caminhos.length) await supabase().storage.from(BUCKET).remove(caminhos);
}
