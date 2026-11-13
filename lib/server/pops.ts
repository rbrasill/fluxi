import 'server-only';
import { createHash } from 'node:crypto';
import { gerarCodigo } from '@/lib/codigo';
import type { DadosPop } from '@/lib/pop/documento';
import { gerarPdf } from '@/lib/pop/pdf';
import type { Anotacoes } from '@/lib/marcacao/anotacoes';
import { conteudoVazio, type ConteudoPop, type Historico, type Passo, type Posicao } from '@/lib/pop/schema';
import { ErroApi } from './http';
import { doProcesso as fluxogramaDoProcesso } from './fluxogramas';
import { excluir as excluirGravacao } from './gravacoes';
import * as referencias from './referencias';
import { areaDoDocumento, garantir as garantirProcesso, tocar } from './processos';
import { TENANT_PADRAO, supabase } from './supabase';
import * as telas from './telas';

const dono = (id: string): telas.Dono => ({ pop_id: id });
const CAMPOS = 'id, nome, codigo, identificacao, versao, status, autor, posicao, processo_id, arquivado_em, link_publico, link_publico_ativo, publicado_em, criado_em, atualizado_em';
// Onde o POP está (processo › área › organização), para listas e caminho no topo das telas.
const ONDE = 'processo:processos(id, nome, arquivado_em, area:areas(id, nome, organizacao:organizacoes(id, nome)))';

type Arquivavel = { arquivado_em: string | null; processo: { arquivado_em: string | null } | null };
/** Arquivado por si ou pelo processo: some das listas e não pode ser editado. */
export const arquivado = (p: Arquivavel) => !!p.arquivado_em || !!p.processo?.arquivado_em;

const hoje = () => new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });

/** POPs ativos (ou só os arquivados, por si ou pelo processo). */
export async function listar(arquivados = false) {
  const { data, error } = await supabase().from('pops').select(`${CAMPOS}, ${ONDE}`).eq('tenant_id', TENANT_PADRAO).order('atualizado_em', { ascending: false });
  if (error) throw error;
  return (data as unknown as Arquivavel[]).filter((p) => arquivado(p) === arquivados);
}

export async function buscar(id: string) {
  const { data, error } = await supabase().from('pops').select(`${CAMPOS}, ${ONDE}, conteudo, historico, publicacao_hash:publicacao->>versao_hash`).eq('tenant_id', TENANT_PADRAO).eq('id', id).maybeSingle();
  if (error) throw error;
  if (!data) throw new ErroApi(404, 'POP não encontrado');
  return data as unknown as {
    id: string; nome: string; codigo: string; identificacao: string; versao: string; status: string; autor: string; posicao: Posicao | null;
    processo_id: string | null; arquivado_em: string | null; link_publico: string; publicado_em: string | null; criado_em: string; atualizado_em: string;
    processo: { id: string; nome: string; arquivado_em: string | null } | null;
    conteudo: ConteudoPop; historico: Historico[];
    publicacao_hash: string | null; // da versão publicada, para saber se há alterações não publicadas
  };
}

export type MarcacaoDoPop = {
  id: string; gravacao_id: string | null; pop_id: string | null; imagem_caminho: string; largura: number | null; altura: number | null;
  anotacoes: Anotacoes | null; imagem_anotada_caminho: string | null; anotada_largura: number | null; anotada_altura: number | null;
};

/** Telas usadas nos passos: marcadas na gravação ou anexadas no POP (as marcações desenhadas ficam na tela). */
export async function marcacoesDoPop(conteudo: ConteudoPop) {
  const ids = [...new Set(conteudo.procedimentos.flatMap((p) => p.passos.map((s) => s.marcacao_id)).filter(Boolean) as string[])];
  if (!ids.length) return new Map<string, MarcacaoDoPop>();
  const { data, error } = await supabase().from('gravacao_marcacoes')
    .select('id, gravacao_id, pop_id, imagem_caminho, largura, altura, anotacoes, imagem_anotada_caminho, anotada_largura, anotada_altura')
    .eq('tenant_id', TENANT_PADRAO).in('id', ids);
  if (error) throw error;
  return new Map((data as MarcacaoDoPop[]).map((m) => [m.id, m]));
}

/** Imagem que vai para o POP: a versão marcada, se houver; senão o print original. */
function imagemFinal(s: Passo, m: Map<string, MarcacaoDoPop>) {
  const t = s.marcacao_id ? m.get(s.marcacao_id) : undefined;
  if (t?.imagem_anotada_caminho && t.imagem_caminho === s.imagem_caminho) {
    return { caminho: t.imagem_anotada_caminho, largura: t.anotada_largura ?? undefined, altura: t.anotada_altura ?? undefined };
  }
  return { caminho: s.imagem_caminho, largura: s.imagem_largura, altura: s.imagem_altura };
}

const assinar = async (caminhos: string[]) => Object.fromEntries(await telas.assinar(caminhos)) as Record<string, string>;

/** Pasta das cópias dos prints da versão publicada (decisão 32): editar o POP não mexe nelas. */
export const pastaPublicacao = (id: string) => `tenants/${TENANT_PADRAO}/publicacoes/${id}`;

/**
 * Impressão digital do que o POP mostra (com a imagem final de cada passo, então marcar uma tela
 * também conta). Se for diferente da versão publicada, há alterações não publicadas.
 */
export function hashDaVersao(p: { nome: string; identificacao: string; versao: string; autor: string; historico: Historico[] }, conteudoFinal: ConteudoPop) {
  return createHash('sha256').update(JSON.stringify([p.nome, p.identificacao, p.versao, p.autor, p.historico, conteudoFinal])).digest('hex');
}

const telasUsadas = (c: ConteudoPop) => new Set(c.procedimentos.flatMap((p) => p.passos.map((s) => s.marcacao_id)).filter(Boolean) as string[]);

/** As gravações de tela do POP, com quantas telas marcadas ainda não entraram nos passos. */
async function gravacoesDoPop(id: string, conteudo: ConteudoPop) {
  const { data, error } = await supabase().from('gravacoes')
    .select('id, nome, status, duracao_ms, processamento, criado_em, marcacoes:gravacao_marcacoes(id, incluir_no_pop)')
    .eq('tenant_id', TENANT_PADRAO).eq('pop_id', id).order('criado_em');
  if (error) throw error;
  const usadas = telasUsadas(conteudo);
  return (data ?? []).map(({ marcacoes, ...g }) => {
    const telas = marcacoes as { id: string; incluir_no_pop: boolean }[];
    return {
      ...g,
      total_marcacoes: telas.length,
      telas_novas: telas.filter((t) => t.incluir_no_pop && !usadas.has(t.id)).length,
    };
  });
}

/** Telas marcadas em todas as gravações do POP, para escolher o print de um passo. */
export async function telasDasGravacoes(id: string) {
  const { data, error } = await supabase().from('gravacao_marcacoes')
    .select('id, gravacao_id, tempo_ms, imagem_caminho, largura, altura, instrucao, anotacoes, imagem_anotada_caminho, gravacao:gravacoes!inner(nome, criado_em)')
    .eq('tenant_id', TENANT_PADRAO).eq('gravacao.pop_id', id).order('tempo_ms');
  if (error) throw error;
  type Linha = { id: string; gravacao_id: string; tempo_ms: number; imagem_caminho: string; largura: number | null; altura: number | null; instrucao: string | null; anotacoes: Anotacoes | null; imagem_anotada_caminho: string | null; gravacao: { nome: string; criado_em: string } };
  const linhas = ((data ?? []) as unknown as Linha[]).sort((a, b) => a.gravacao.criado_em.localeCompare(b.gravacao.criado_em) || a.tempo_ms - b.tempo_ms);
  const urls = await assinar(linhas.flatMap((m) => [m.imagem_caminho, m.imagem_anotada_caminho].filter(Boolean) as string[]));
  return linhas.map(({ gravacao, imagem_anotada_caminho, ...m }) => ({
    ...m,
    gravacao_nome: gravacao.nome,
    imagem_url: urls[m.imagem_caminho] ?? null,
    imagem_anotada_url: imagem_anotada_caminho ? urls[imagem_anotada_caminho] ?? null : null,
  }));
}

/**
 * POP com links temporários para as imagens dos passos. `imagens` (por imagem_caminho) já aponta
 * para a versão marcada; `telas` traz o original e as marcações, para reabrir o editor.
 */
export async function obter(id: string) {
  const pop = await buscar(id);
  const [marcs, gravacoes, fluxo, refs, referenciado_em] = await Promise.all([
    marcacoesDoPop(pop.conteudo),
    gravacoesDoPop(id, pop.conteudo),
    pop.processo_id ? fluxogramaDoProcesso(pop.processo_id) : null,
    referencias.resolverDosTextos(referencias.textosDoPop(pop.conteudo).map((t) => t.valor)),
    referencias.referenciadoEm({ tipo: 'pop', id }),
  ]);
  const passos = pop.conteudo.procedimentos.flatMap((p) => p.passos).filter((s) => s.imagem_caminho);
  const finais = passos.map((s) => [s.imagem_caminho!, imagemFinal(s, marcs).caminho!] as const);
  const urls = await assinar([...finais.map(([, f]) => f), ...[...marcs.values()].map((m) => m.imagem_caminho)]);
  const imagens = Object.fromEntries(finais.filter(([, f]) => urls[f]).map(([orig, f]) => [orig, urls[f]]));
  const telasDoPop = Object.fromEntries([...marcs.values()].map((m) => [m.id, {
    gravacao_id: m.gravacao_id,
    pop_id: m.pop_id,
    imagem_url: urls[m.imagem_caminho] ?? null,
    largura: m.largura,
    altura: m.altura,
    anotacoes: m.anotacoes,
  }]));
  const { publicacao_hash, ...resto } = pop;
  // Publicado, mas o que está no editor não é o que está na página pública.
  const alteracoes_nao_publicadas = pop.status === 'publicado' && publicacao_hash !== hashDaVersao(pop, comImagensFinais(pop.conteudo, marcs));
  // O fluxograma é do processo (decisão 31): o editor só o mostra, como informação.
  const fluxograma = fluxo
    ? { id: fluxo.id as string, nome: fluxo.nome as string, origem: fluxo.origem as string, miniatura: (fluxo.miniatura as string | null) ?? null, tem_svg: !!fluxo.tem_svg, atualizado_em: fluxo.atualizado_em as string }
    : null;
  return { ...resto, imagens, telas: telasDoPop, gravacoes, alteracoes_nao_publicadas, fluxograma, referencias: refs, referenciado_em };
}

/** POP novo, em branco, dentro de um processo. As gravações de tela são feitas a partir dele. */
export async function criar(p: { nome?: string; processo_id?: string }) {
  const processoId = p.processo_id ?? null;
  let conteudo = conteudoVazio();
  const nome = p.nome?.trim() || 'Novo POP';

  // O "código do processo" no documento é o código do processo em que o POP está.
  const codigo = processoId ? (await garantirProcesso(processoId)).codigo : gerarCodigo();
  if (processoId && !conteudo.area) {
    const { data: pr } = await supabase().from('processos').select('area:areas(nome)').eq('id', processoId).maybeSingle();
    const area = (pr?.area as { nome?: string } | null)?.nome;
    if (area) conteudo = { ...conteudo, area };
  }

  const { data, error } = await supabase().from('pops').insert({
    tenant_id: TENANT_PADRAO,
    nome,
    codigo,
    conteudo,
    historico: [{ data: hoje(), elaborado_por: '', revisao: 'Rev. 01' }],
    processo_id: processoId,
  }).select('id').single();
  if (error) throw error;
  await tocar(processoId);
  return data;
}

export async function atualizar(id: string, dados: Partial<{ nome: string; identificacao: string; versao: string; autor: string; conteudo: ConteudoPop; historico: Historico[]; posicao: Posicao | null; status: string; processo_id: string | null }>) {
  // Mudou de processo: o código do processo no documento acompanha.
  const codigo = dados.processo_id ? { codigo: (await garantirProcesso(dados.processo_id)).codigo } : {};
  const { data, error } = await supabase().from('pops').update({ ...dados, ...codigo, atualizado_em: new Date().toISOString() })
    .eq('tenant_id', TENANT_PADRAO).eq('id', id).select('id, atualizado_em').maybeSingle();
  if (error) throw error;
  if (!data) throw new ErroApi(404, 'POP não encontrado');
  // O texto mudou: o índice de referências acompanha (decisão 35).
  if (dados.conteudo) await referencias.indexar({ tipo: 'pop', id }, referencias.textosDoPop(dados.conteudo));
  return data;
}

export async function arquivar(id: string, arquivado: boolean) {
  const { data, error } = await supabase().from('pops').update({ arquivado_em: arquivado ? new Date().toISOString() : null, atualizado_em: new Date().toISOString() })
    .eq('tenant_id', TENANT_PADRAO).eq('id', id).select('id, arquivado_em').maybeSingle();
  if (error) throw error;
  if (!data) throw new ErroApi(404, 'POP não encontrado');
  return data;
}

/** Apaga o POP com as gravações dele e os prints anexados. Quem confere se está arquivado é `exclusao.ts`. */
export async function excluirDefinitivo(id: string) {
  const { data: gravs, error: e1 } = await supabase().from('gravacoes').select('id').eq('tenant_id', TENANT_PADRAO).eq('pop_id', id);
  if (e1) throw e1;
  for (const g of gravs ?? []) await excluirGravacao(g.id, { preservarTelas: false });
  // Telas do POP: as anexadas ficam na pasta dele; as que vieram de uma gravação já excluída
  // ficaram na pasta da gravação (decisão 34), então são apagadas pelo caminho.
  const { data: doPop, error: e2 } = await supabase().from('gravacao_marcacoes').select('imagem_caminho, imagem_anotada_caminho').eq('tenant_id', TENANT_PADRAO).eq('pop_id', id);
  if (e2) throw e2;
  const caminhos = (doPop ?? []).flatMap((m) => [m.imagem_caminho, m.imagem_anotada_caminho]).filter(Boolean) as string[];
  if (caminhos.length) await supabase().storage.from(telas.BUCKET).remove(caminhos);
  await telas.removerPasta(dono(id)); // prints anexados no POP
  const pasta = pastaPublicacao(id); // cópias da versão publicada
  const { data: copias } = await supabase().storage.from(telas.BUCKET).list(pasta, { limit: 1000 });
  if (copias?.length) await supabase().storage.from(telas.BUCKET).remove(copias.map((a) => `${pasta}/${a.name}`));
  const { error } = await supabase().from('pops').delete().eq('tenant_id', TENANT_PADRAO).eq('id', id);
  if (error) throw error;
  await referencias.removerDoIndice({ tipo: 'pop', id });
  return { ok: true };
}

// --- Mover e copiar (decisão 36) ---

type ProcessoDestino = { id: string; codigo: string; nome: string; arquivado_em: string | null; areaNome: string };
async function processoDestino(id: string): Promise<ProcessoDestino> {
  const { data, error } = await supabase().from('processos').select('id, codigo, nome, arquivado_em, area:areas(nome)').eq('tenant_id', TENANT_PADRAO).eq('id', id).maybeSingle();
  if (error) throw error;
  if (!data) throw new ErroApi(404, 'Processo não encontrado');
  if (data.arquivado_em) throw new ErroApi(409, 'O processo de destino está arquivado. Restaure-o antes.');
  return { id: data.id as string, codigo: data.codigo as string, nome: data.nome as string, arquivado_em: data.arquivado_em as string | null, areaNome: (data.area as unknown as { nome: string } | null)?.nome ?? '' };
}
const areaDoPop = (pop: { processo: unknown }) => ((pop.processo as { area?: { nome?: string } | null } | null)?.area?.nome ?? null);

/**
 * Move o POP para outro processo (decisão 36). O código do processo no documento e o campo "Área"
 * acompanham; as gravações de tela do POP vão junto. O link público continua o mesmo.
 */
export async function moverParaProcesso(id: string, processoId: string) {
  const pop = await buscar(id);
  if (pop.processo_id === processoId) throw new ErroApi(400, 'O POP já está neste processo.');
  const destino = await processoDestino(processoId);
  await atualizar(id, { processo_id: destino.id, conteudo: { ...pop.conteudo, area: areaDoDocumento(pop.conteudo.area ?? '', areaDoPop(pop), destino.areaNome) } });
  const { error } = await supabase().from('gravacoes').update({ processo_id: destino.id }).eq('tenant_id', TENANT_PADRAO).eq('pop_id', id);
  if (error) throw error;
  await tocar(pop.processo_id as string | null);
  await tocar(destino.id);
  return { processo_id: destino.id };
}

/**
 * Copia o POP para um processo (decisão 36): textos, prints (copiados para a pasta do POP novo, com
 * as marcações) e referências. A cópia nasce como rascunho, versão 1.0, com link público próprio e
 * a mesma identificação (a pessoa ajusta). Gravações de tela não vão.
 */
export async function copiar(id: string, p: { processo_id: string; nome?: string }) {
  const pop = await buscar(id);
  const destino = await processoDestino(p.processo_id);
  const mesmo = pop.processo_id === destino.id;
  const nome = p.nome?.trim() || (mesmo ? `${pop.nome} (cópia)` : pop.nome);
  const db = supabase();
  const { data: novo, error } = await db.from('pops').insert({
    tenant_id: TENANT_PADRAO, nome, codigo: destino.codigo, identificacao: pop.identificacao, versao: '1.0', autor: pop.autor, status: 'rascunho',
    processo_id: destino.id, conteudo: conteudoVazio(), historico: [{ data: hoje(), elaborado_por: pop.autor ?? '', revisao: 'Rev. 01' }],
  }).select('id').single();
  if (error) throw error;
  const novoId = novo.id as string;
  const marcs = await marcacoesDoPop(pop.conteudo);
  const conteudo = await copiarPrints(pop.conteudo, marcs, novoId);
  conteudo.area = areaDoDocumento(conteudo.area ?? '', areaDoPop(pop), destino.areaNome);
  const { error: e2 } = await db.from('pops').update({ conteudo }).eq('tenant_id', TENANT_PADRAO).eq('id', novoId);
  if (e2) throw e2;
  await referencias.indexar({ tipo: 'pop', id: novoId }, referencias.textosDoPop(conteudo));
  await tocar(destino.id);
  return { id: novoId };
}

/** Cada print usado nos passos vira um arquivo (e uma tela) do POP novo; a marcação desenhada vai junto. */
async function copiarPrints(conteudo: ConteudoPop, marcs: Map<string, MarcacaoDoPop>, novoId: string): Promise<ConteudoPop> {
  const db = supabase();
  const pasta = telas.pastaDe(dono(novoId));
  const ext = (c: string) => c.match(/\.([a-z0-9]{2,5})$/i)?.[1]?.toLowerCase() ?? 'png';
  const copias = new Map<string, { caminho: string; marcacao_id: string }>();
  const copiarArquivo = async (de: string, para: string) => {
    const { error } = await db.storage.from(telas.BUCKET).copy(de, para);
    if (error) throw error;
  };
  const passoCopiado = async (s: Passo): Promise<Passo> => {
    if (!s.imagem_caminho) return s;
    const ja = copias.get(s.imagem_caminho);
    if (ja) return { ...s, imagem_caminho: ja.caminho, marcacao_id: ja.marcacao_id };
    const m = s.marcacao_id ? marcs.get(s.marcacao_id) : undefined;
    const base = `${pasta}tela-${crypto.randomUUID()}`;
    const caminho = `${base}.${ext(s.imagem_caminho)}`;
    try {
      await copiarArquivo(s.imagem_caminho, caminho);
      let anotada: string | null = null;
      if (m?.imagem_anotada_caminho) { anotada = `${base}-marcada.png`; await copiarArquivo(m.imagem_anotada_caminho, anotada); }
      const { data, error } = await db.from('gravacao_marcacoes').insert({
        tenant_id: TENANT_PADRAO, pop_id: novoId, tempo_ms: null, imagem_caminho: caminho, largura: m?.largura ?? s.imagem_largura ?? null, altura: m?.altura ?? s.imagem_altura ?? null,
        incluir_no_pop: true, anotacoes: m?.anotacoes ?? null, imagem_anotada_caminho: anotada, anotada_largura: m?.anotada_largura ?? null, anotada_altura: m?.anotada_altura ?? null,
      }).select('id').single();
      if (error) throw error;
      copias.set(s.imagem_caminho, { caminho, marcacao_id: data.id as string });
      return { ...s, imagem_caminho: caminho, marcacao_id: data.id as string };
    } catch (e) {
      // Não deu para copiar o arquivo: o passo fica apontando para o print original (some se ele for apagado).
      console.warn(`cópia do POP ${novoId}: print ${s.imagem_caminho} não foi copiado (${e instanceof Error ? e.message : e})`);
      const { marcacao_id: _m, ...resto } = s;
      return resto;
    }
  };
  const procedimentos = [];
  for (const p of conteudo.procedimentos) {
    const passos: Passo[] = [];
    for (const s of p.passos) passos.push(await passoCopiado(s));
    procedimentos.push({ ...p, passos });
  }
  return { ...conteudo, procedimentos };
}

// --- Prints anexados direto no POP (telas que não vieram de uma gravação) ---

export const urlDeUploadTela = (id: string, extensao: string) => telas.urlDeUpload(dono(id), 'imagem', extensao);
export const criarTela = (id: string, m: { imagem_caminho: string; largura?: number; altura?: number }) => telas.criar(dono(id), m);
export const salvarAnotacaoTela = (id: string, telaId: string, a: { anotacoes: Anotacoes; imagem_anotada_caminho: string; largura: number; altura: number } | null) =>
  telas.salvarAnotacao(dono(id), telaId, a);
export const excluirTela = (id: string, telaId: string) => telas.excluir(dono(id), telaId);

/**
 * Leva para o POP as telas de uma gravação que ainda não estão nele (ex.: gravação continuada
 * depois de o POP existir). Entram como passos de um procedimento novo, na ordem do tempo.
 */
export async function adicionarTelasDaGravacao(id: string, gravacaoId: string) {
  const pop = await buscar(id);
  const { data, error } = await supabase().from('gravacao_marcacoes')
    .select('id, imagem_caminho, largura, altura, instrucao, instrucao_ia')
    .eq('tenant_id', TENANT_PADRAO).eq('gravacao_id', gravacaoId).eq('incluir_no_pop', true).order('tempo_ms');
  if (error) throw error;
  const usadas = telasUsadas(pop.conteudo);
  const novas = (data ?? []).filter((t) => !usadas.has(t.id));
  if (!novas.length) return { adicionadas: 0 };
  const passos: Passo[] = novas.map((t) => ({
    texto: t.instrucao || t.instrucao_ia || '',
    imagem_caminho: t.imagem_caminho,
    imagem_largura: t.largura ?? undefined,
    imagem_altura: t.altura ?? undefined,
    marcacao_id: t.id,
  }));
  const conteudo: ConteudoPop = { ...pop.conteudo, procedimentos: [...pop.conteudo.procedimentos, { nome: `Telas adicionadas em ${hoje()}`, passos }] };
  await atualizar(id, { conteudo });
  return { adicionadas: novas.length };
}

/** Os passos com a imagem que vai para o documento: a versão marcada de cada tela (com o tamanho dela, que muda com o recorte). */
export function comImagensFinais(conteudo: ConteudoPop, marcs: Map<string, MarcacaoDoPop>): ConteudoPop {
  return {
    ...conteudo,
    procedimentos: conteudo.procedimentos.map((p) => ({
      ...p,
      passos: p.passos.map((s) => {
        if (!s.imagem_caminho) return s;
        const f = imagemFinal(s, marcs);
        return { ...s, imagem_caminho: f.caminho, imagem_largura: f.largura, imagem_altura: f.altura };
      }),
    })),
  };
}

/** Link público "só o fluxograma" do processo (decisão 32): o "Abrir diagrama" do documento leva para ele. */
export const linkDoFluxograma = (origem: string, link: string) => `${origem}/f/${link}`;

export type BaseDocumento = { nome: string; codigo: string; identificacao: string; versao: string; autor: string; criado_em: string; historico: Historico[]; conteudo: ConteudoPop };

/** Gera o PDF do POP a partir do conteúdo (com as imagens já nos caminhos finais). `origem` é a base dos links públicos das referências. O POP sai só em PDF (decisão 79). */
export async function gerarDocumento(base: BaseDocumento, linkFluxograma: string | null, origem: string) {
  const caminhos = [...new Set(base.conteudo.procedimentos.flatMap((p) => p.passos.map((s) => s.imagem_caminho)).filter(Boolean) as string[])];
  const imagens = new Map<string, Uint8Array>();
  await Promise.all(caminhos.map(async (c) => {
    const { data } = await supabase().storage.from(telas.BUCKET).download(c);
    if (data) imagens.set(c, new Uint8Array(await data.arrayBuffer()));
  }));
  const dados: DadosPop = {
    ...base.conteudo,
    nome: base.nome,
    codigo: base.codigo,
    identificacao: base.identificacao,
    versao: base.versao,
    autor: base.autor,
    criado_em: base.criado_em,
    historico: base.historico,
    link_fluxograma: linkFluxograma,
    referencias: referencias.paraDocumento(await referencias.resolverDosTextos(referencias.textosDoPop(base.conteudo).map((t) => t.valor)), origem),
  };
  const nomeBase = `POP ${base.identificacao ? `${base.identificacao} ` : ''}${base.nome}`.replace(/[\\/:*?"<>|]+/g, ' ').trim();
  return { arquivo: await gerarPdf(dados, imagens), nomeArquivo: `${nomeBase}.pdf` };
}

/** PDF do POP como está agora (o que a área está editando). */
export async function pdf(id: string, origem: string) {
  const original = await buscar(id);
  const conteudo = comImagensFinais(original.conteudo, await marcacoesDoPop(original.conteudo));
  const fluxo = original.processo_id ? await fluxogramaDoProcesso(original.processo_id) : null;
  return gerarDocumento({ ...original, conteudo }, fluxo ? linkDoFluxograma(origem, fluxo.link_publico) : null, origem);
}

