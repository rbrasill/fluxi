import 'server-only';
import type { ConteudoPop } from '@/lib/pop/schema';
import { historicoDasVersoes, MAX_O_QUE_MUDOU, MIN_O_QUE_MUDOU, PRIMEIRA_VERSAO, proximaVersao, TEXTO_DA_PRIMEIRA_VERSAO, textoDaVersao, type TipoDeAlteracao, type TipoDeVersao } from '@/lib/pop/versao';
import { ErroApi } from './http';
import * as pops from './pops';
import * as processos from './processos';
import * as referencias from './referencias';
import { lerOrigemPublica, rotuloDoc, type ReferenciaResolvida } from '@/lib/referencias';
import { TENANT_PADRAO, supabase } from './supabase';
import * as telas from './telas';
import * as versoes from './versoes';

// Publicação online (decisão 32). Ao publicar, o POP vira uma versão guardada (`pops.publicacao`),
// com cópias dos prints numa pasta própria: a página pública mostra só ela, e editar o POP depois
// não muda o que está publicado até alguém publicar de novo. O processo também (decisão 129): ao
// publicar, guarda o nome, a descrição e o fluxograma com a imagem (`processos.publicacao` e
// `publicacao_svg`); a página do processo, a do fluxograma e o fluxograma mostrado na página do POP
// usam essa cópia. Nada vai ao ar sem a pessoa publicar. Os links são públicos para quem os tiver;
// quando a plataforma fechar, as mesmas páginas passam a pedir login. A chave `link_publico_ativo`
// (decisão 34) deixa a página online ou offline sem mexer na versão publicada.

export type Publicacao = pops.BaseDocumento & {
  versao_hash: string; // impressão digital do que foi publicado (ver pops.hashDaVersao)
  hash_v?: number; // como a impressão digital foi calculada (ver pops.temAlteracoes); sem a marca: antes do versionamento
  publicado_em: string;
};

/** A versão publicada do processo (decisão 129). A imagem do fluxograma fica à parte, em `processos.publicacao_svg`. */
export type PublicacaoProcesso = {
  versao_hash: string; // ver processos.hashDoProcesso
  publicado_em: string;
  nome: string; codigo: string; descricao: string;
  fluxograma: { nome: string; link_publico: string; atualizado_em: string } | null;
};

const extensao = (caminho: string) => caminho.match(/\.([a-z0-9]{2,5})$/i)?.[1]?.toLowerCase() ?? 'png';
const NAO_DISPONIVEL = 'Este POP não está disponível.';

/** O que a pessoa informa ao publicar a partir da segunda versão (decisão 138). */
export type PedidoDePublicacao = { tipo?: TipoDeAlteracao; o_que_mudou?: string };

/**
 * Publica o POP como uma versão nova (decisão 138). A primeira publicação é a 1.0.0. Nas seguintes, quem publica
 * escolhe o tamanho da alteração (correção, ajuste ou mudança no procedimento), que define o número, e escreve o que
 * mudou. Cada versão fica guardada em `pop_versoes`, com os prints daquele dia; `pops.publicacao` é a mais recente.
 */
export async function publicar(id: string, pedido: PedidoDePublicacao = {}, pessoa: { id: string; nome: string } | null = null) {
  const pop = await pops.buscar(id);
  if (pops.arquivado(pop)) throw new ErroApi(409, 'O POP está arquivado: restaure-o antes de publicar.');
  const final = pops.comImagensFinais(pop.conteudo, await pops.marcacoesDoPop(pop.conteudo));

  const anterior = await versoes.ultima(id);
  let tipo: TipoDeVersao = 'primeira';
  let oQueMudou = TEXTO_DA_PRIMEIRA_VERSAO;
  if (anterior) {
    if (!pops.temAlteracoes(pop, final)) throw new ErroApi(409, `Não há alterações para publicar: o POP está igual à versão ${anterior.versao}.`);
    if (!pedido.tipo) throw new ErroApi(400, 'Escolha o tamanho da alteração: correção, ajuste ou mudança no procedimento.');
    const texto = (pedido.o_que_mudou ?? '').replace(/\s+/g, ' ').trim();
    if (texto.length < MIN_O_QUE_MUDOU) throw new ErroApi(400, `Diga o que mudou, com pelo menos ${MIN_O_QUE_MUDOU} caracteres.`);
    if (texto.length > MAX_O_QUE_MUDOU) throw new ErroApi(400, `Resuma o que mudou em até ${MAX_O_QUE_MUDOU} caracteres.`);
    tipo = pedido.tipo;
    oQueMudou = texto;
  }
  const numero = anterior ? proximaVersao(anterior.numero, tipo as TipoDeAlteracao) : PRIMEIRA_VERSAO;
  const versao = textoDaVersao(numero);

  // Cópia de cada print (já com as marcações): editar, trocar ou apagar o print no editor não afeta as versões
  // publicadas. O print que já foi copiado na versão anterior (mesmo arquivo de origem) é reaproveitado.
  const pasta = pops.pastaPublicacao(id);
  const lote = Date.now().toString(36);
  const copias = new Map<string, string>();
  const novas: string[] = [];
  const originais = [...new Set(final.procedimentos.flatMap((p) => p.passos.map((s) => s.imagem_caminho)).filter(Boolean) as string[])];
  await Promise.all(originais.map(async (c, i) => {
    const ja = anterior?.copias[c];
    if (ja) { copias.set(c, ja); return; }
    const destino = `${pasta}/${lote}-${i + 1}.${extensao(c)}`;
    const { error } = await supabase().storage.from(telas.BUCKET).copy(c, destino);
    if (error) console.warn(`publicação do POP ${id}: print ${c} não foi copiado (${error.message})`);
    else { copias.set(c, destino); novas.push(destino); }
  }));
  const conteudo: ConteudoPop = {
    ...final,
    procedimentos: final.procedimentos.map((p) => ({
      ...p,
      passos: p.passos.map((s) => {
        const copia = s.imagem_caminho ? copias.get(s.imagem_caminho) : undefined;
        return copia ? { texto: s.texto, imagem_caminho: copia, imagem_largura: s.imagem_largura, imagem_altura: s.imagem_altura } : { texto: s.texto };
      }),
    })),
  };

  const agora = new Date().toISOString();
  const publicacao: Publicacao = {
    versao_hash: pops.hashDaVersao(pop, final),
    hash_v: pops.VERSAO_DO_HASH,
    publicado_em: agora,
    nome: pop.nome, codigo: pop.codigo, identificacao: pop.identificacao, versao, autor: pop.autor, criado_em: pop.criado_em,
    historico: [], // o histórico do documento é montado na hora, a partir das versões (ver `historicoDasVersoes`)
    conteudo,
  };
  const descartarCopias = async () => { if (novas.length) await supabase().storage.from(telas.BUCKET).remove(novas); };
  // Primeiro a versão: se duas pessoas publicarem ao mesmo tempo, a segunda é recusada aqui.
  try {
    await versoes.registrar(id, { numero, tipo, o_que_mudou: oQueMudou, publicado_por: pessoa?.nome ?? '', publicado_por_id: pessoa?.id ?? null, publicado_em: agora, publicacao, copias: Object.fromEntries(copias) });
  } catch (e) {
    await descartarCopias();
    throw e;
  }
  const { error } = await supabase().from('pops').update({ status: 'publicado', publicacao, publicado_em: agora, versao, atualizado_em: agora })
    .eq('tenant_id', TENANT_PADRAO).eq('id', id);
  if (error) {
    await versoes.desfazer(id, numero);
    await descartarCopias();
    throw error;
  }
  // As cópias das versões anteriores ficam: cada versão continua podendo ser aberta e baixada.
  return { publicado_em: agora, link_publico: pop.link_publico, versao, versoes: await versoes.listar(id) };
}

/**
 * Chave da página pública (decisão 34): online mostra a versão publicada; offline mostra "Este POP
 * não está disponível". A versão publicada e o link continuam os mesmos.
 */
export async function definirLinkPublico(id: string, ativo: boolean) {
  const pop = await pops.buscar(id);
  if (ativo && pops.arquivado(pop)) throw new ErroApi(409, 'O POP está arquivado: restaure-o antes de colocar a página no ar.');
  if (ativo && pop.status !== 'publicado') throw new ErroApi(409, 'Publique o POP antes de colocar a página no ar.');
  const { error } = await supabase().from('pops').update({ link_publico_ativo: ativo }).eq('tenant_id', TENANT_PADRAO).eq('id', id);
  if (error) throw error;
  return { link_publico_ativo: ativo };
}

type Onde = { id: string; nome: string; arquivado_em: string | null; link_publico?: string; link_publico_ativo?: boolean; area: { nome: string; organizacao: { nome: string } | null } | null } | null;

/** O que a página pública mostra de cada referência: sem os endereços internos do app. */
const paraPublico = (r: Record<string, ReferenciaResolvida>) =>
  Object.fromEntries(Object.entries(r).map(([k, { url_app: _u, ...x }]) => [k, x])) as Record<string, Omit<ReferenciaResolvida, 'url_app'>>;
/** "Referenciado em" da página pública: só documentos que também estão no ar. */
const referenciadoPublico = async (doc: referencias.Doc) => (await referencias.referenciadoEm(doc)).filter((x) => x.publico).map(({ url_app: _u, ...x }) => x);

/** A versão publicada do POP pelo link público (só POP publicado, com a página online e não arquivado). */
async function versaoPublicada(link: string) {
  const { data, error } = await supabase().from('pops')
    .select('id, status, link_publico_ativo, arquivado_em, publicacao, processo:processos(id, nome, arquivado_em, link_publico, link_publico_ativo, publicado_em, publicacao, area:areas(nome, organizacao:organizacoes(nome)))')
    .eq('link_publico', link).maybeSingle();
  if (error) throw error;
  const processo = data?.processo as unknown as (Onde & { publicado_em?: string | null; publicacao?: PublicacaoProcesso | null });
  // Sem versão guardada não há o que mostrar: nada é publicado sozinho (decisão 129). Antes, o POP publicado antes
  // da decisão 32 ganhava a versão guardada na primeira visita à página pública.
  const guardada = data?.publicacao as Publicacao | null | undefined;
  if (!data || data.status !== 'publicado' || !guardada || !data.link_publico_ativo || data.arquivado_em || processo?.arquivado_em) throw new ErroApi(404, NAO_DISPONIVEL);
  // A versão e o histórico do documento vêm das versões publicadas (decisão 138): valem também para o que foi
  // publicado antes do versionamento, que virou a 1.0.0.
  const lista = await versoes.listar(data.id as string);
  const publicacao: Publicacao = { ...guardada, versao: lista[0]?.versao ?? guardada.versao, historico: lista.length ? historicoDasVersoes(lista) : guardada.historico };
  // O fluxograma que aparece no POP é o publicado com o processo; sem processo publicado, não aparece.
  const f = processo?.publicacao?.fluxograma;
  const fluxo = f ? { link_publico: f.link_publico, nome: f.nome, tem_svg: true } : null;
  return { id: data.id as string, publicacao, processo, fluxo };
}

/** O que a página pública do POP mostra, com links temporários para os prints. */
export async function popPublico(link: string) {
  const { id, publicacao: p, processo, fluxo } = await versaoPublicada(link);
  const caminhos = p.conteudo.procedimentos.flatMap((x) => x.passos.map((s) => s.imagem_caminho)).filter(Boolean) as string[];
  const [imagens, refs, referenciado_em] = await Promise.all([
    telas.assinar(caminhos).then((m) => Object.fromEntries(m) as Record<string, string>),
    referencias.resolverDosTextos(referencias.textosDoPop(p.conteudo).map((t) => t.valor)),
    referenciadoPublico({ tipo: 'pop', id }),
  ]);
  const { versao_hash: _h, hash_v: _v, ...versao } = p;
  return {
    ...versao,
    imagens,
    onde: { organizacao: processo?.area?.organizacao?.nome ?? null, area: processo?.area?.nome ?? null, processo: processo?.nome ?? null },
    // O processo tem página pública (decisão 35): o caminho do topo leva a ela, se estiver no ar.
    processo_link: processo && !processo.arquivado_em && processo.publicado_em && processo.link_publico_ativo ? (processo.link_publico as string) : null,
    fluxograma: fluxo,
    referencias: paraPublico(refs),
    referenciado_em,
  };
}

/**
 * Uma versão publicada do POP, para quem está logado (decisão 138): o documento como saiu naquele dia, só leitura,
 * no mesmo formato da página pública. O histórico vai até aquela versão.
 */
async function versaoGuardada(id: string, versao: string) {
  const [pop, v, lista] = await Promise.all([pops.buscar(id), versoes.buscar<Publicacao>(id, versao), versoes.listar(id)]);
  const publicacao: Publicacao = { ...v.publicacao, versao: v.versao, publicado_em: v.publicado_em, historico: historicoDasVersoes(lista, v.versao) };
  return { pop, v, publicacao, atual: lista[0]?.versao ?? v.versao };
}

export async function versaoDoPop(id: string, versao: string) {
  const { pop, v, publicacao: p, atual } = await versaoGuardada(id, versao);
  const caminhos = p.conteudo.procedimentos.flatMap((x) => x.passos.map((s) => s.imagem_caminho)).filter(Boolean) as string[];
  const [imagens, refs] = await Promise.all([
    telas.assinar(caminhos).then((m) => Object.fromEntries(m) as Record<string, string>),
    referencias.resolverDosTextos(referencias.textosDoPop(p.conteudo).map((t) => t.valor)),
  ]);
  const { versao_hash: _h, hash_v: _v, ...documento } = p;
  const processo = pop.processo as unknown as Onde;
  return {
    ...documento,
    imagens,
    onde: { organizacao: processo?.area?.organizacao?.nome ?? null, area: processo?.area?.nome ?? null, processo: processo?.nome ?? null },
    processo_link: null,
    fluxograma: null,
    referencias: paraPublico(refs),
    referenciado_em: [],
    // O que a página de leitura mostra sobre a versão.
    desta_versao: { tipo: v.tipo, o_que_mudou: v.o_que_mudou, publicado_por: v.publicado_por, versao_atual: atual, pop_nome: pop.nome },
  };
}

/** PDF de uma versão publicada do POP (decisão 138). */
export async function documentoDaVersao(id: string, versao: string, origem: string) {
  const { pop, publicacao } = await versaoGuardada(id, versao);
  // O "Abrir diagrama" leva ao fluxograma publicado com o processo, como no PDF da página pública.
  let fluxo: string | null = null;
  if (pop.processo_id) {
    const { data } = await supabase().from('processos').select('link:publicacao->fluxograma->>link_publico').eq('tenant_id', TENANT_PADRAO).eq('id', pop.processo_id).maybeSingle();
    fluxo = (data as { link?: string | null } | null)?.link ?? null;
  }
  const doc = await pops.gerarDocumento(publicacao, fluxo ? pops.linkDoFluxograma(origem, fluxo) : null, origem);
  return { ...doc, nomeArquivo: doc.nomeArquivo.replace(/\.pdf$/, ` v${publicacao.versao}.pdf`) };
}

/** PDF da versão publicada (o que está na página pública). */
export async function documentoPublico(link: string, origem: string) {
  const { publicacao, fluxo } = await versaoPublicada(link);
  return pops.gerarDocumento(publicacao, fluxo ? pops.linkDoFluxograma(origem, fluxo.link_publico) : null, origem);
}

/** A página pública do processo (decisão 35): descrição, fluxograma e os POPs publicados e no ar. */
export async function processoPublico(link: string) {
  const db = supabase();
  const { data, error } = await db.from('processos').select('id, arquivado_em, link_publico_ativo, publicacao, area:areas(nome, organizacao:organizacoes(nome))')
    .eq('link_publico', link).maybeSingle();
  if (error) throw error;
  // Só a versão que a pessoa publicou (decisão 129): o que mudou depois fica de fora até publicar de novo.
  const pub = data?.publicacao as PublicacaoProcesso | null | undefined;
  if (!data || !pub || data.arquivado_em || !data.link_publico_ativo) throw new ErroApi(404, 'Este processo não está disponível.');
  const area = data.area as unknown as { nome: string; organizacao: { nome: string } | null } | null;
  const [o, refs, referenciado_em] = await Promise.all([
    db.from('pops').select('id, nome, identificacao, codigo, versao, link_publico, publicado_em').eq('tenant_id', TENANT_PADRAO).eq('processo_id', data.id)
      .eq('status', 'publicado').eq('link_publico_ativo', true).is('arquivado_em', null).order('identificacao').order('nome'),
    referencias.resolverDosTextos([pub.descricao]),
    referenciadoPublico({ tipo: 'processo', id: data.id as string }),
  ]);
  if (o.error) throw o.error;
  return {
    nome: pub.nome, codigo: pub.codigo, descricao: pub.descricao ?? '', publicado_em: pub.publicado_em,
    onde: { organizacao: area?.organizacao?.nome ?? null, area: area?.nome ?? null, processo: null },
    fluxograma: pub.fluxograma ? { link_publico: pub.fluxograma.link_publico, nome: pub.fluxograma.nome, tem_svg: true } : null,
    pops: (o.data ?? []).map((x) => ({ nome: x.nome as string, identificacao: (x.identificacao as string) || null, codigo: x.codigo as string, versao: x.versao as string, link_publico: x.link_publico as string, publicado_em: x.publicado_em as string | null })),
    referencias: paraPublico(refs),
    referenciado_em,
  };
}

/** Título e endereço do documento de origem (?de=), para o "← Voltar para…" das páginas públicas. Só se ele também está no ar. */
export async function tituloPublico(de: string | null) {
  const origem = lerOrigemPublica(de);
  if (!origem) throw new ErroApi(400, 'Origem inválida');
  const db = supabase();
  if (origem.tipo === 'p') {
    const { data, error } = await db.from('pops').select('nome, identificacao, codigo, status, arquivado_em, link_publico_ativo, publicacao_hash:publicacao->>versao_hash, processo:processos(arquivado_em)').eq('link_publico', origem.link).maybeSingle();
    if (error) throw error;
    const pa = (data?.processo as unknown as { arquivado_em: string | null } | null)?.arquivado_em;
    if (!data || data.status !== 'publicado' || !data.publicacao_hash || !data.link_publico_ativo || data.arquivado_em || pa) throw new ErroApi(404, NAO_DISPONIVEL);
    return { titulo: rotuloDoc({ tipo: 'pop', nome: data.nome as string, identificacao: data.identificacao as string, codigo: data.codigo as string }), url: `/p/${origem.link}` };
  }
  const { data, error } = await db.from('processos').select('nome, codigo, arquivado_em, link_publico_ativo, publicado_em, publicacao_nome:publicacao->>nome').eq('link_publico', origem.link).maybeSingle();
  if (error) throw error;
  if (!data || data.arquivado_em || !data.publicado_em || !data.link_publico_ativo) throw new ErroApi(404, 'Este processo não está disponível.');
  return { titulo: rotuloDoc({ tipo: 'processo', nome: (data.publicacao_nome as string | null) ?? (data.nome as string), codigo: data.codigo as string }), url: `/pr/${origem.link}` };
}

/**
 * O fluxograma só fica público por uma publicação feita pela pessoa (decisões 128 e 129): é a imagem guardada ao
 * publicar o processo, e aparece com a página do processo no ar ou com um POP do processo publicado e no ar (a página
 * e o PDF dele mostram o fluxograma). Sem isso, o link `/f/<link>` e o SVG respondem "não disponível".
 */
async function fluxogramaExposto(processo: { id: string; arquivado_em: string | null; link_publico_ativo?: boolean } | null) {
  if (!processo || processo.arquivado_em) return false;
  if (processo.link_publico_ativo) return true;
  const { count, error } = await supabase().from('pops').select('id', { count: 'exact', head: true }).eq('tenant_id', TENANT_PADRAO)
    .eq('processo_id', processo.id).eq('status', 'publicado').eq('link_publico_ativo', true).is('arquivado_em', null).not('publicacao', 'is', null);
  if (error) throw error;
  return (count ?? 0) > 0;
}

type ProcessoDoFluxo = { id: string; nome: string; arquivado_em: string | null; link_publico_ativo: boolean; publicacao: PublicacaoProcesso | null; publicacao_svg?: string | null; area: { nome: string; organizacao: { nome: string } | null } | null };

/** O processo do fluxograma, se o fluxograma publicado com ele é este e está exposto. */
async function processoDoFluxoPublicado(link: string, processo: ProcessoDoFluxo | null) {
  const f = processo?.publicacao?.fluxograma;
  if (!processo || !f || f.link_publico !== link || !(await fluxogramaExposto(processo))) return null;
  return { processo, f };
}

/** A página pública "só o fluxograma" (o link do "Abrir diagrama" no PDF). */
export async function fluxogramaPublico(link: string) {
  const { data, error } = await supabase().from('fluxogramas')
    .select('codigo, processo:processos(id, nome, arquivado_em, link_publico_ativo, publicacao, area:areas(nome, organizacao:organizacoes(nome)))')
    .eq('link_publico', link).maybeSingle();
  if (error) throw error;
  const achado = await processoDoFluxoPublicado(link, (data?.processo as unknown as ProcessoDoFluxo | null) ?? null);
  if (!data || !achado) throw new ErroApi(404, 'Este fluxograma não está disponível.');
  const { processo, f } = achado;
  const nomeProcesso = processo.publicacao?.nome ?? processo.nome;
  return {
    nome: f.nome, codigo: data.codigo as string, tem_svg: true, atualizado_em: f.atualizado_em,
    onde: { organizacao: processo.area?.organizacao?.nome ?? null, area: processo.area?.nome ?? null, processo: nomeProcesso },
  };
}

/** O SVG do fluxograma publicado (servido como imagem, com política que impede qualquer código de rodar). */
export async function svgPublico(link: string) {
  const { data, error } = await supabase().from('fluxogramas').select('processo:processos(id, nome, arquivado_em, link_publico_ativo, publicacao, publicacao_svg, area:areas(nome))').eq('link_publico', link).maybeSingle();
  if (error) throw error;
  const achado = await processoDoFluxoPublicado(link, (data?.processo as unknown as ProcessoDoFluxo | null) ?? null);
  if (!achado?.processo.publicacao_svg) throw new ErroApi(404, 'Fluxograma não disponível.');
  return achado.processo.publicacao_svg;
}

/**
 * Publica o processo (decisão 129): guarda o nome, a descrição e o fluxograma com a imagem. A página pública passa a
 * mostrar esta versão até a pessoa publicar de novo. Com fluxograma sem imagem (o editor a gera ao abrir), pede para
 * abrir o fluxograma antes, para a página não ficar sem o desenho.
 */
export async function publicarProcesso(id: string) {
  const db = supabase();
  const { data: p, error } = await db.from('processos').select('id, nome, codigo, descricao, arquivado_em').eq('tenant_id', TENANT_PADRAO).eq('id', id).maybeSingle();
  if (error) throw error;
  if (!p) throw new ErroApi(404, 'Processo não encontrado');
  if (p.arquivado_em) throw new ErroApi(409, 'O processo está arquivado: restaure-o antes de publicar.');
  const { data: f, error: e2 } = await db.from('fluxogramas').select('nome, xml, svg, link_publico, atualizado_em').eq('tenant_id', TENANT_PADRAO).eq('processo_id', id).maybeSingle();
  if (e2) throw e2;
  if (f && !f.svg) throw new ErroApi(409, 'O fluxograma ainda não tem a imagem para a página pública. Abra o fluxograma uma vez (a imagem é gerada ao abrir) e publique de novo.');
  const agora = new Date().toISOString();
  const descricao = (p.descricao as string | null) ?? '';
  const publicacao: PublicacaoProcesso = {
    versao_hash: processos.hashDoProcesso({ nome: p.nome as string, descricao }, f ? { nome: f.nome as string, xml: (f.xml as string | null) ?? '' } : null),
    publicado_em: agora,
    nome: p.nome as string, codigo: p.codigo as string, descricao,
    fluxograma: f ? { nome: f.nome as string, link_publico: f.link_publico as string, atualizado_em: f.atualizado_em as string } : null,
  };
  const { error: e3 } = await db.from('processos').update({ publicacao, publicacao_svg: (f?.svg as string | null) ?? null, publicado_em: agora })
    .eq('tenant_id', TENANT_PADRAO).eq('id', id);
  if (e3) throw e3;
  return { publicado_em: agora };
}

