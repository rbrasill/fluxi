import 'server-only';
import type { ConteudoPop } from '@/lib/pop/schema';
import { doProcesso as fluxogramaDoProcesso } from './fluxogramas';
import { ErroApi } from './http';
import * as pops from './pops';
import * as referencias from './referencias';
import { lerOrigemPublica, rotuloDoc, type ReferenciaResolvida } from '@/lib/referencias';
import { TENANT_PADRAO, supabase } from './supabase';
import * as telas from './telas';

// Publicação online (decisão 32). Ao publicar, o POP vira uma versão guardada (`pops.publicacao`),
// com cópias dos prints numa pasta própria: a página pública mostra só ela, e editar o POP depois
// não muda o que está publicado até alguém publicar de novo. O fluxograma é do processo e aparece
// sempre na última versão salva (o SVG que o editor exporta). Os links são públicos para quem os
// tiver; quando a plataforma fechar, as mesmas páginas passam a pedir login. A chave
// `link_publico_ativo` (decisão 34) deixa a página online ou offline sem mexer na versão publicada.

export type Publicacao = pops.BaseDocumento & {
  versao_hash: string; // impressão digital do que foi publicado (ver pops.hashDaVersao)
  publicado_em: string;
};

const extensao = (caminho: string) => caminho.match(/\.([a-z0-9]{2,5})$/i)?.[1]?.toLowerCase() ?? 'png';
const NAO_DISPONIVEL = 'Este POP não está disponível.';

export async function publicar(id: string) {
  const pop = await pops.buscar(id);
  if (pops.arquivado(pop)) throw new ErroApi(409, 'O POP está arquivado: restaure-o antes de publicar.');
  const final = pops.comImagensFinais(pop.conteudo, await pops.marcacoesDoPop(pop.conteudo));

  // Cópia de cada print (já com as marcações): editar, trocar ou apagar o print no editor não afeta a versão publicada.
  const pasta = pops.pastaPublicacao(id);
  const lote = Date.now().toString(36);
  const copias = new Map<string, string>();
  const originais = [...new Set(final.procedimentos.flatMap((p) => p.passos.map((s) => s.imagem_caminho)).filter(Boolean) as string[])];
  await Promise.all(originais.map(async (c, i) => {
    const destino = `${pasta}/${lote}-${i + 1}.${extensao(c)}`;
    const { error } = await supabase().storage.from(telas.BUCKET).copy(c, destino);
    if (error) console.warn(`publicação do POP ${id}: print ${c} não foi copiado (${error.message})`);
    else copias.set(c, destino);
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
    publicado_em: agora,
    nome: pop.nome, codigo: pop.codigo, identificacao: pop.identificacao, versao: pop.versao, autor: pop.autor, criado_em: pop.criado_em,
    historico: pop.historico,
    conteudo,
  };
  const { error } = await supabase().from('pops').update({ status: 'publicado', publicacao, publicado_em: agora, atualizado_em: agora })
    .eq('tenant_id', TENANT_PADRAO).eq('id', id);
  if (error) {
    if (copias.size) await supabase().storage.from(telas.BUCKET).remove([...copias.values()]);
    throw error;
  }
  // As cópias da versão anterior não são mais usadas.
  const { data: arquivos } = await supabase().storage.from(telas.BUCKET).list(pasta, { limit: 1000 });
  const antigas = (arquivos ?? []).filter((a) => !a.name.startsWith(`${lote}-`)).map((a) => `${pasta}/${a.name}`);
  if (antigas.length) await supabase().storage.from(telas.BUCKET).remove(antigas);
  return { publicado_em: agora, link_publico: pop.link_publico, publicacao };
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
    .select('id, status, link_publico_ativo, arquivado_em, publicacao, processo:processos(id, nome, arquivado_em, link_publico, link_publico_ativo, area:areas(nome, organizacao:organizacoes(nome)))')
    .eq('link_publico', link).maybeSingle();
  if (error) throw error;
  const processo = data?.processo as unknown as Onde;
  if (!data || data.status !== 'publicado' || !data.link_publico_ativo || data.arquivado_em || processo?.arquivado_em) throw new ErroApi(404, NAO_DISPONIVEL);
  // Publicado antes de existir a versão guardada: guarda agora o conteúdo atual.
  const publicacao = (data.publicacao as Publicacao | null) ?? (await publicar(data.id)).publicacao;
  const fluxo = processo ? await fluxogramaDoProcesso(processo.id) : null;
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
  const { versao_hash: _h, ...versao } = p;
  return {
    ...versao,
    imagens,
    onde: { organizacao: processo?.area?.organizacao?.nome ?? null, area: processo?.area?.nome ?? null, processo: processo?.nome ?? null },
    // O processo tem página pública (decisão 35): o caminho do topo leva a ela, se estiver no ar.
    processo_link: processo && !processo.arquivado_em && processo.link_publico_ativo ? (processo.link_publico as string) : null,
    fluxograma: fluxo ? { link_publico: fluxo.link_publico as string, nome: fluxo.nome as string, tem_svg: !!fluxo.tem_svg } : null,
    referencias: paraPublico(refs),
    referenciado_em,
  };
}

/** PDF ou DOCX da versão publicada (o que está na página pública). */
export async function documentoPublico(link: string, formato: 'docx' | 'pdf', origem: string) {
  const { publicacao, fluxo } = await versaoPublicada(link);
  return pops.gerarDocumento(formato, publicacao, fluxo ? pops.linkDoFluxograma(origem, fluxo.link_publico) : null, origem);
}

/** A página pública do processo (decisão 35): descrição, fluxograma e os POPs publicados e no ar. */
export async function processoPublico(link: string) {
  const db = supabase();
  const { data, error } = await db.from('processos').select('id, nome, codigo, descricao, arquivado_em, link_publico_ativo, area:areas(nome, organizacao:organizacoes(nome))')
    .eq('link_publico', link).maybeSingle();
  if (error) throw error;
  if (!data || data.arquivado_em || !data.link_publico_ativo) throw new ErroApi(404, 'Este processo não está disponível.');
  const area = data.area as unknown as { nome: string; organizacao: { nome: string } | null } | null;
  const [fluxo, o, refs, referenciado_em] = await Promise.all([
    fluxogramaDoProcesso(data.id as string),
    db.from('pops').select('id, nome, identificacao, codigo, versao, link_publico, publicado_em').eq('tenant_id', TENANT_PADRAO).eq('processo_id', data.id)
      .eq('status', 'publicado').eq('link_publico_ativo', true).is('arquivado_em', null).order('identificacao').order('nome'),
    referencias.resolverDosTextos([data.descricao as string]),
    referenciadoPublico({ tipo: 'processo', id: data.id as string }),
  ]);
  if (o.error) throw o.error;
  return {
    nome: data.nome as string, codigo: data.codigo as string, descricao: (data.descricao as string) ?? '',
    onde: { organizacao: area?.organizacao?.nome ?? null, area: area?.nome ?? null, processo: null },
    fluxograma: fluxo ? { link_publico: fluxo.link_publico as string, nome: fluxo.nome as string, tem_svg: !!fluxo.tem_svg } : null,
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
    const { data, error } = await db.from('pops').select('nome, identificacao, codigo, status, arquivado_em, link_publico_ativo, processo:processos(arquivado_em)').eq('link_publico', origem.link).maybeSingle();
    if (error) throw error;
    const pa = (data?.processo as unknown as { arquivado_em: string | null } | null)?.arquivado_em;
    if (!data || data.status !== 'publicado' || !data.link_publico_ativo || data.arquivado_em || pa) throw new ErroApi(404, NAO_DISPONIVEL);
    return { titulo: rotuloDoc({ tipo: 'pop', nome: data.nome as string, identificacao: data.identificacao as string, codigo: data.codigo as string }), url: `/p/${origem.link}` };
  }
  const { data, error } = await db.from('processos').select('nome, codigo, arquivado_em, link_publico_ativo').eq('link_publico', origem.link).maybeSingle();
  if (error) throw error;
  if (!data || data.arquivado_em || !data.link_publico_ativo) throw new ErroApi(404, 'Este processo não está disponível.');
  return { titulo: rotuloDoc({ tipo: 'processo', nome: data.nome as string, codigo: data.codigo as string }), url: `/pr/${origem.link}` };
}

/** A página pública "só o fluxograma" (o link do "Abrir diagrama" no PDF e no DOCX). */
export async function fluxogramaPublico(link: string) {
  const { data, error } = await supabase().from('fluxogramas')
    .select('nome, codigo, tem_svg, atualizado_em, processo:processos(nome, arquivado_em, area:areas(nome, organizacao:organizacoes(nome)))')
    .eq('link_publico', link).maybeSingle();
  if (error) throw error;
  const processo = data?.processo as unknown as Onde;
  if (!data || !processo || processo.arquivado_em) throw new ErroApi(404, 'Este fluxograma não está disponível.');
  return {
    nome: data.nome as string, codigo: data.codigo as string, tem_svg: !!data.tem_svg, atualizado_em: data.atualizado_em as string,
    onde: { organizacao: processo.area?.organizacao?.nome ?? null, area: processo.area?.nome ?? null, processo: processo.nome },
  };
}

/** O SVG do fluxograma (servido como imagem, com política que impede qualquer código de rodar). */
export async function svgPublico(link: string) {
  const { data, error } = await supabase().from('fluxogramas').select('svg, processo:processos(arquivado_em)').eq('link_publico', link).maybeSingle();
  if (error) throw error;
  const processo = data?.processo as unknown as { arquivado_em: string | null } | null;
  if (!data?.svg || !processo || processo.arquivado_em) throw new ErroApi(404, 'Fluxograma não disponível.');
  return data.svg as string;
}

