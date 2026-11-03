import 'server-only';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { gerarCodigo } from '@/lib/codigo';
import { gerarDocx, type DadosPop } from '@/lib/pop/docx';
import { gerarPdf } from '@/lib/pop/pdf';
import type { Anotacoes } from '@/lib/marcacao/anotacoes';
import { conteudoVazio, type ConteudoPop, type Historico, type Passo, type Posicao } from '@/lib/pop/schema';
import { ErroApi } from './http';
import { garantir as garantirArea } from './areas';
import { doProcesso as fluxogramaDoProcesso } from './fluxogramas';
import { excluir as excluirGravacao } from './gravacoes';
import { areaDoDocumento, atualizar as atualizarProcesso, criar as criarProcesso, garantir as garantirProcesso, tocar } from './processos';
import { TENANT_PADRAO, supabase } from './supabase';
import * as telas from './telas';

const dono = (id: string): telas.Dono => ({ pop_id: id });
const CAMPOS = 'id, nome, codigo, identificacao, versao, status, autor, posicao, processo_id, arquivado_em, link_publico, publicado_em, criado_em, atualizado_em';
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
    .select('id, nome, status, duracao_ms, processamento, criado_em, marcacoes:gravacao_marcacoes(id, incluir_no_pop), segmentos:gravacao_segmentos(transcricao_status)')
    .eq('tenant_id', TENANT_PADRAO).eq('pop_id', id).order('criado_em');
  if (error) throw error;
  const usadas = telasUsadas(conteudo);
  return (data ?? []).map(({ marcacoes, segmentos, ...g }) => {
    const telas = marcacoes as { id: string; incluir_no_pop: boolean }[];
    const segs = segmentos as { transcricao_status: string }[];
    return {
      ...g,
      total_marcacoes: telas.length,
      telas_novas: telas.filter((t) => t.incluir_no_pop && !usadas.has(t.id)).length,
      transcrita: segs.length > 0 && segs.every((s) => s.transcricao_status === 'pronta'),
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
  const [marcs, gravacoes, fluxo] = await Promise.all([
    marcacoesDoPop(pop.conteudo),
    gravacoesDoPop(id, pop.conteudo),
    pop.processo_id ? fluxogramaDoProcesso(pop.processo_id) : null,
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
  return { ...resto, imagens, telas: telasDoPop, gravacoes, alteracoes_nao_publicadas, fluxograma };
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
  for (const g of gravs ?? []) await excluirGravacao(g.id);
  await telas.removerPasta(dono(id)); // prints anexados no POP
  const pasta = pastaPublicacao(id); // cópias da versão publicada
  const { data: copias } = await supabase().storage.from(telas.BUCKET).list(pasta, { limit: 1000 });
  if (copias?.length) await supabase().storage.from(telas.BUCKET).remove(copias.map((a) => `${pasta}/${a.name}`));
  const { error } = await supabase().from('pops').delete().eq('tenant_id', TENANT_PADRAO).eq('id', id);
  if (error) throw error;
  return { ok: true };
}

/**
 * Move o POP para outra área. A área do POP é a do processo dele, então o processo vai junto, com
 * tudo o que tem (POPs, gravações, fluxogramas). POP solto (sem processo) entra num processo da área
 * de destino, existente ou criado aqui. O campo "Área" do documento acompanha (se estava vazio ou com
 * o nome da área antiga).
 */
export async function moverParaArea(id: string, p: { area_id: string; processo_id?: string; novo_processo?: string }) {
  const pop = await buscar(id);
  const area = await garantirArea(p.area_id);

  if (pop.processo_id) {
    await atualizarProcesso(pop.processo_id, { area_id: area.id });
    return { processo_id: pop.processo_id };
  }

  let destino = p.processo_id;
  if (destino) {
    const { data, error } = await supabase().from('processos').select('area_id').eq('tenant_id', TENANT_PADRAO).eq('id', destino).maybeSingle();
    if (error) throw error;
    if (!data) throw new ErroApi(404, 'Processo não encontrado');
    if (data.area_id !== area.id) throw new ErroApi(400, 'O processo escolhido não é dessa área.');
  } else {
    destino = (await criarProcesso({ nome: p.novo_processo?.trim() || pop.nome, area_id: area.id })).id as string;
  }
  await atualizar(id, { processo_id: destino, conteudo: { ...pop.conteudo, area: areaDoDocumento(pop.conteudo.area ?? '', null, area.nome) } });
  await tocar(destino);
  return { processo_id: destino };
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

/** Gera o DOCX ou o PDF a partir do conteúdo (com as imagens já nos caminhos finais). */
export async function gerarDocumento(formato: 'docx' | 'pdf', base: BaseDocumento, linkFluxograma: string | null) {
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
  };
  const nomeBase = `POP ${base.identificacao ? `${base.identificacao} ` : ''}${base.nome}`.replace(/[\\/:*?"<>|]+/g, ' ').trim();
  if (formato === 'pdf') return { arquivo: await gerarPdf(dados, imagens), nomeArquivo: `${nomeBase}.pdf` };
  const modelo = await readFile(path.join(process.cwd(), 'templates/pop/modelo-pop-v3.template.docx'));
  return { arquivo: gerarDocx(modelo, dados, imagens), nomeArquivo: `${nomeBase}.docx` };
}

/** Documento do POP como está agora (o que a área está editando). */
async function documento(id: string, origem: string, formato: 'docx' | 'pdf') {
  const original = await buscar(id);
  const conteudo = comImagensFinais(original.conteudo, await marcacoesDoPop(original.conteudo));
  const fluxo = original.processo_id ? await fluxogramaDoProcesso(original.processo_id) : null;
  return gerarDocumento(formato, { ...original, conteudo }, fluxo ? linkDoFluxograma(origem, fluxo.link_publico) : null);
}

export const docx = (id: string, origem: string) => documento(id, origem, 'docx');
export const pdf = (id: string, origem: string) => documento(id, origem, 'pdf');
