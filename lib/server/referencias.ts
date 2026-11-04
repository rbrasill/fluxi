import 'server-only';
import { referenciasDoTexto } from '@/lib/pop/texto-rico';
import { chaveRef, rotuloDoc, type Doc, type ReferenciadoEm, type Relacao, type ReferenciaResolvida, type ResultadoBusca, type Situacao, type TipoDoc } from '@/lib/referencias';
import { TENANT_PADRAO, supabase } from './supabase';

// Referências entre POPs e processos (decisão 35). O texto rico é a fonte: ao salvar, as referências
// são extraídas para a tabela `referencias` (índice), que responde "quem aponta para este documento".
// Os nomes nunca ficam guardados aqui: são resolvidos na hora de mostrar.

export type { Doc };
type Onde = { nome: string; organizacao: { nome: string } | null } | null;

const normalizar = (s: string | null | undefined) => (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();


/** POPs e processos ativos que batem com `q` (nome, identificação ou código), sem o próprio documento. */
export async function buscar(q: string, excluir?: Doc | null): Promise<ResultadoBusca[]> {
  const db = supabase();
  const [o, p] = await Promise.all([
    db.from('pops').select('id, nome, identificacao, codigo, status, link_publico_ativo, arquivado_em, processo:processos(nome, arquivado_em, area:areas(nome, organizacao:organizacoes(nome)))')
      .eq('tenant_id', TENANT_PADRAO).is('arquivado_em', null),
    db.from('processos').select('id, nome, codigo, link_publico_ativo, arquivado_em, area:areas(nome, organizacao:organizacoes(nome))')
      .eq('tenant_id', TENANT_PADRAO).is('arquivado_em', null),
  ]);
  if (o.error) throw o.error;
  if (p.error) throw p.error;
  const caminho = (...partes: (string | null | undefined)[]) => partes.filter(Boolean).join(' › ');
  const itens: ResultadoBusca[] = [
    ...(o.data ?? []).filter((x) => !(x.processo as unknown as { arquivado_em: string | null } | null)?.arquivado_em).map((x) => {
      const pr = x.processo as unknown as { nome: string; area: Onde } | null;
      return { tipo: 'pop' as const, id: x.id as string, nome: x.nome as string, identificacao: (x.identificacao as string) || null, codigo: x.codigo as string,
        rotulo: rotuloDoc({ tipo: 'pop', nome: x.nome as string, identificacao: x.identificacao as string, codigo: x.codigo as string }),
        onde: caminho(pr?.area?.organizacao?.nome, pr?.area?.nome, pr?.nome),
        situacao: (x.status !== 'publicado' ? 'nao_publicado' : !x.link_publico_ativo ? 'offline' : 'ok') as Situacao };
    }),
    ...(p.data ?? []).map((x) => {
      const a = x.area as unknown as Onde;
      return { tipo: 'processo' as const, id: x.id as string, nome: x.nome as string, identificacao: null, codigo: x.codigo as string,
        rotulo: rotuloDoc({ tipo: 'processo', nome: x.nome as string, codigo: x.codigo as string }), onde: caminho(a?.organizacao?.nome, a?.nome),
        situacao: (x.link_publico_ativo ? 'ok' : 'offline') as Situacao };
    }),
  ].filter((x) => !(excluir && x.tipo === excluir.tipo && x.id === excluir.id));
  const termo = normalizar(q);
  if (!termo) return itens.sort((a, b) => a.rotulo.localeCompare(b.rotulo, 'pt-BR')).slice(0, 40);
  // Ordem: identificação ou código igual, nome começando pelo termo, depois qualquer trecho.
  const pontos = (x: ResultadoBusca) => {
    const id = normalizar(x.identificacao), cod = normalizar(x.codigo), nome = normalizar(x.nome);
    if (id === termo || cod === termo) return 0;
    if (nome.startsWith(termo) || id.startsWith(termo) || cod.startsWith(termo)) return 1;
    if (nome.includes(termo) || id.includes(termo) || cod.includes(termo) || normalizar(x.onde).includes(termo)) return 2;
    return 9;
  };
  return itens.map((x) => [pontos(x), x] as const).filter(([n]) => n < 9)
    .sort((a, b) => a[0] - b[0] || a[1].rotulo.localeCompare(b[1].rotulo, 'pt-BR')).map(([, x]) => x).slice(0, 40);
}

/** Extrai as referências dos textos do documento para o índice (apaga as anteriores da mesma origem). */
export async function indexar(origem: Doc, textos: { campo: string; valor: string | null | undefined }[]) {
  const db = supabase();
  const linhas = new Map<string, { destino_tipo: TipoDoc; destino_id: string; relacao: Relacao; campo: string }>();
  for (const { campo, valor } of textos) {
    for (const r of referenciasDoTexto(valor)) {
      if (r.tipo === origem.tipo && r.id === origem.id) continue; // referência a si mesmo não conta
      linhas.set(`${r.tipo}:${r.id}:${r.relacao}:${campo}`, { destino_tipo: r.tipo, destino_id: r.id, relacao: r.relacao, campo });
    }
  }
  const { error } = await db.from('referencias').delete().eq('tenant_id', TENANT_PADRAO).eq('origem_tipo', origem.tipo).eq('origem_id', origem.id);
  if (error) throw error;
  if (!linhas.size) return;
  const { error: e2 } = await db.from('referencias').insert([...linhas.values()].map((l) => ({ tenant_id: TENANT_PADRAO, origem_tipo: origem.tipo, origem_id: origem.id, ...l })));
  if (e2) throw e2;
}

/** Tira o documento do índice (ao excluir de vez): como origem e como destino. */
export async function removerDoIndice(doc: Doc) {
  const db = supabase();
  const a = await db.from('referencias').delete().eq('tenant_id', TENANT_PADRAO).eq('origem_tipo', doc.tipo).eq('origem_id', doc.id);
  if (a.error) throw a.error;
  const b = await db.from('referencias').delete().eq('tenant_id', TENANT_PADRAO).eq('destino_tipo', doc.tipo).eq('destino_id', doc.id);
  if (b.error) throw b.error;
}

/** Nome atual, situação e links de cada documento (por chave "tipo:id"). Documento que não existe mais vem como `excluido`. */
export async function resolver(docs: Doc[]): Promise<Record<string, ReferenciaResolvida>> {
  const popIds = [...new Set(docs.filter((d) => d.tipo === 'pop').map((d) => d.id))];
  const procIds = [...new Set(docs.filter((d) => d.tipo === 'processo').map((d) => d.id))];
  const db = supabase();
  const [o, p] = await Promise.all([
    popIds.length ? db.from('pops').select('id, nome, identificacao, codigo, status, arquivado_em, link_publico, link_publico_ativo, processo:processos(arquivado_em)').eq('tenant_id', TENANT_PADRAO).in('id', popIds) : { data: [], error: null },
    procIds.length ? db.from('processos').select('id, nome, codigo, arquivado_em, link_publico, link_publico_ativo').eq('tenant_id', TENANT_PADRAO).in('id', procIds) : { data: [], error: null },
  ]);
  if (o.error) throw o.error;
  if (p.error) throw p.error;
  const saida: Record<string, ReferenciaResolvida> = {};
  for (const x of o.data ?? []) {
    const processoArquivado = !!(x.processo as unknown as { arquivado_em: string | null } | null)?.arquivado_em;
    const situacao: Situacao = x.arquivado_em || processoArquivado ? 'arquivado' : x.status !== 'publicado' ? 'nao_publicado' : !x.link_publico_ativo ? 'offline' : 'ok';
    saida[`pop:${x.id}`] = {
      tipo: 'pop', id: x.id as string, nome: x.nome as string, identificacao: (x.identificacao as string) || null, codigo: x.codigo as string,
      rotulo: rotuloDoc({ tipo: 'pop', nome: x.nome as string, identificacao: x.identificacao as string, codigo: x.codigo as string }),
      situacao, publico: situacao === 'ok', url_app: `/app/pops/${x.id}`, url_publica: `/p/${x.link_publico}`,
    };
  }
  for (const x of p.data ?? []) {
    const situacao: Situacao = x.arquivado_em ? 'arquivado' : !x.link_publico_ativo ? 'offline' : 'ok';
    saida[`processo:${x.id}`] = {
      tipo: 'processo', id: x.id as string, nome: x.nome as string, identificacao: null, codigo: x.codigo as string,
      rotulo: rotuloDoc({ tipo: 'processo', nome: x.nome as string, codigo: x.codigo as string }),
      situacao, publico: situacao === 'ok', url_app: `/app/processos/${x.id}`, url_publica: `/pr/${x.link_publico}`,
    };
  }
  for (const d of docs) {
    const k = chaveRef(d);
    if (!saida[k]) saida[k] = { tipo: d.tipo, id: d.id, nome: '', identificacao: null, codigo: null, rotulo: '', situacao: 'excluido', publico: false, url_app: '', url_publica: null };
  }
  return saida;
}

/** As referências que estão nos textos, resolvidas. */
export async function resolverDosTextos(textos: (string | null | undefined)[]) {
  const refs = textos.flatMap((t) => referenciasDoTexto(t));
  if (!refs.length) return {} as Record<string, ReferenciaResolvida>;
  return resolver(refs);
}

/** Quem aponta para este documento (pelo índice), com o nome atual e as relações usadas. */
export async function referenciadoEm(destino: Doc): Promise<ReferenciadoEm[]> {
  const { data, error } = await supabase().from('referencias').select('origem_tipo, origem_id, relacao')
    .eq('tenant_id', TENANT_PADRAO).eq('destino_tipo', destino.tipo).eq('destino_id', destino.id);
  if (error) throw error;
  const origens = new Map<string, { doc: Doc; relacoes: Set<Relacao> }>();
  for (const r of data ?? []) {
    const doc = { tipo: r.origem_tipo as TipoDoc, id: r.origem_id as string };
    const k = chaveRef(doc);
    origens.set(k, { doc, relacoes: (origens.get(k)?.relacoes ?? new Set()).add(r.relacao as Relacao) });
  }
  if (!origens.size) return [];
  const resolvidas = await resolver([...origens.values()].map((x) => x.doc));
  return [...origens.values()]
    .map(({ doc, relacoes }) => ({ ...resolvidas[chaveRef(doc)], relacoes: [...relacoes] }))
    .filter((x) => x.situacao !== 'excluido')
    .sort((a, b) => a.rotulo.localeCompare(b.rotulo, 'pt-BR'));
}

/** Para o PDF e o DOCX: rótulo atual e endereço absoluto da página pública de cada destino. */
export function paraDocumento(resolvidas: Record<string, ReferenciaResolvida>, origem: string) {
  const saida: Record<string, { rotulo?: string; url: string | null }> = {};
  for (const [k, r] of Object.entries(resolvidas)) saida[k] = { rotulo: r.rotulo || undefined, url: r.url_publica ? `${origem}${r.url_publica}` : null };
  return saida;
}

/** Textos do POP que podem ter referências: objetivo e os passos. */
export const textosDoPop = (c: { objetivo: string; procedimentos: { passos: { texto: string }[] }[] }) => [
  { campo: 'objetivo', valor: c.objetivo },
  ...c.procedimentos.flatMap((p, i) => p.passos.map((s, k) => ({ campo: `passo ${i + 1}.${k + 1}`, valor: s.texto }))),
];
