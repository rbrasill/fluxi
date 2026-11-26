import 'server-only';
import { semColunaDoCriador } from './criador';
import { createHash } from 'node:crypto';
import { gerarCodigo } from '@/lib/codigo';
import type { ConteudoPop } from '@/lib/pop/schema';
import { garantir as garantirArea } from './areas';
import { ErroApi } from './http';
import { montarIcone } from './icones';
import type { IconeDoProcesso } from '@/lib/icones';
import * as referencias from './referencias';
import { TENANT_PADRAO, supabase } from './supabase';
import * as versoes from './versoes';

const CAMPOS = 'id, codigo, nome, descricao, icone, area_id, arquivado_em, link_publico, link_publico_ativo, publicado_em, criado_em, atualizado_em, area:areas(id, nome, organizacao:organizacoes(id, nome))';

/**
 * Impressão digital do que vai para a página pública do processo (decisão 129): o nome, a descrição e o desenho do
 * fluxograma (o XML, não a imagem, que o editor refaz ao abrir). Diferente da publicada: "Alterações não publicadas".
 */
export function hashDoProcesso(p: { nome: string; descricao: string | null }, fluxo: { nome: string; xml: string | null } | null) {
  return createHash('sha256').update(JSON.stringify([p.nome, p.descricao ?? '', fluxo ? [fluxo.nome, fluxo.xml ?? ''] : null])).digest('hex');
}

/** Quantos itens de uma relação embutida não estão arquivados. */
export const ativos = (x: unknown) => ((x as { arquivado_em: string | null }[] | null) ?? []).filter((i) => !i.arquivado_em).length;

/** Processos ativos (ou só os arquivados). As contagens só consideram POPs ativos. */
export async function listar(arquivados = false) {
  let q = supabase().from('processos')
    .select(`${CAMPOS}, fluxogramas(count), gravacoes(count), pops(arquivado_em)`)
    .eq('tenant_id', TENANT_PADRAO).order('atualizado_em', { ascending: false });
  q = arquivados ? q.not('arquivado_em', 'is', null) : q.is('arquivado_em', null);
  const { data, error } = await q;
  if (error) throw error;
  const n = (x: unknown) => (x as { count: number }[])[0]?.count ?? 0;
  return data.map(({ fluxogramas, gravacoes, pops, ...p }) => ({ ...p, total: { fluxogramas: n(fluxogramas), gravacoes: n(gravacoes), pops: ativos(pops) } }));
}

export async function garantir(id: string) {
  const { data, error } = await supabase().from('processos').select('id, codigo, nome').eq('tenant_id', TENANT_PADRAO).eq('id', id).maybeSingle();
  if (error) throw error;
  if (!data) throw new ErroApi(404, 'Processo não encontrado');
  return data;
}

/** Marca o processo como mexido (sobe na lista). */
export async function tocar(id: string | null | undefined) {
  if (id) await supabase().from('processos').update({ atualizado_em: new Date().toISOString() }).eq('tenant_id', TENANT_PADRAO).eq('id', id);
}

// O processo nasce fora do ar (decisão 128): só a pessoa coloca a página pública no ar, pela chave da página do
// processo. Vale também para a cópia, que é criada por aqui. A coluna tem o mesmo padrão no banco (migração 0027),
// mas o valor vai explícito para não depender dela.
// `criadorId` é quem criou (decisão 149): a prévia antes de publicar só abre para essa pessoa. Com o banco ainda sem a
// coluna (migração 0034), o processo é gravado sem ela.
export async function criar(d: { nome: string; area_id: string; descricao?: string; icone?: IconeDoProcesso | null }, criadorId: string | null = null) {
  await garantirArea(d.area_id);
  let comCriador = !!criadorId;
  for (let i = 0; i < 4; i++) {
    const { data, error } = await supabase().from('processos')
      .insert({ tenant_id: TENANT_PADRAO, codigo: gerarCodigo(), nome: d.nome, area_id: d.area_id, descricao: d.descricao ?? '', link_publico_ativo: false, icone: d.icone ?? null, ...(comCriador ? { criado_por_id: criadorId } : {}) })
      .select(CAMPOS).single();
    if (!error) return data;
    if (comCriador && semColunaDoCriador(error)) { comCriador = false; continue; }
    if (error.code !== '23505') throw error;
  }
  throw new ErroApi(500, 'Não foi possível gerar um código único');
}

/** Tudo o que está dentro do processo. */
export async function obter(id: string) {
  const db = supabase();
  const [p, f, g, o] = await Promise.all([
    db.from('processos').select(`${CAMPOS}, publicacao_hash:publicacao->>versao_hash`).eq('tenant_id', TENANT_PADRAO).eq('id', id).maybeSingle(),
    db.from('fluxogramas').select('id, codigo, nome, origem, miniatura, link_publico, tem_svg, atualizado_em, xml').eq('tenant_id', TENANT_PADRAO).eq('processo_id', id).maybeSingle(),
    db.from('gravacoes').select('id, nome, status, duracao_ms, processamento, criado_em, pop:pops!pop_id(nome), marcacoes:gravacao_marcacoes(count)')
      .eq('tenant_id', TENANT_PADRAO).eq('processo_id', id).order('criado_em', { ascending: false }),
    db.from('pops').select('id, nome, codigo, identificacao, versao, status, link_publico_ativo, arquivado_em, atualizado_em').eq('tenant_id', TENANT_PADRAO).eq('processo_id', id).order('atualizado_em', { ascending: false }),
  ]);
  for (const r of [p, f, g, o]) if (r.error) throw r.error;
  if (!p.data) throw new ErroApi(404, 'Processo não encontrado');
  const [refs, referenciado_em, lista] = await Promise.all([
    referencias.resolverDosTextos([p.data.descricao as string]),
    referencias.referenciadoEm({ tipo: 'processo', id }),
    versoes.doProcesso.listar(id),
  ]);
  // Publicado e diferente do que está na página pública (decisão 129). O XML do fluxograma só entra na conta.
  const { publicacao_hash, ...processo } = p.data as typeof p.data & { publicacao_hash: string | null };
  const { xml, ...fluxograma } = (f.data ?? {}) as { xml?: string | null } & Record<string, unknown>;
  const alteracoes_nao_publicadas = !!processo.publicado_em
    && publicacao_hash !== hashDoProcesso(processo as { nome: string; descricao: string | null }, f.data ? { nome: f.data.nome as string, xml: xml ?? '' } : null);
  return {
    ...processo,
    alteracoes_nao_publicadas,
    referencias: refs, referenciado_em, // decisão 35
    versoes: lista, // as versões publicadas, da mais nova para a mais antiga (decisão 139)
    fluxograma: f.data ? fluxograma : null, // um por processo (decisão 31)
    gravacoes: (g.data ?? []).map(({ marcacoes, pop, ...x }) => (
      { ...x, pop_nome: (pop as unknown as { nome: string } | null)?.nome ?? null, total_marcacoes: (marcacoes as { count: number }[])[0]?.count ?? 0 }
    )),
    pops: o.data ?? [],
  };
}

/**
 * Campo "Área" do documento do POP ao mudar de área: acompanha a área nova se estava vazio ou com o
 * nome da área antiga; se a pessoa escreveu outra coisa, fica como está.
 */
export function areaDoDocumento(atual: string, antiga: string | null | undefined, nova: string) {
  const t = atual.trim().toLowerCase();
  return !t || (!!antiga && t === antiga.trim().toLowerCase()) ? nova : atual;
}

/** Atualiza o campo "Área" do documento dos POPs do processo (depois de o processo mudar de área). */
async function sincronizarAreaDosPops(processoId: string, antiga: string | null, nova: string) {
  const db = supabase();
  const { data, error } = await db.from('pops').select('id, conteudo').eq('tenant_id', TENANT_PADRAO).eq('processo_id', processoId);
  if (error) throw error;
  await Promise.all((data ?? []).map(async (p) => {
    const c = p.conteudo as ConteudoPop;
    const area = areaDoDocumento(c.area ?? '', antiga, nova);
    if (area === c.area) return;
    const { error: e } = await db.from('pops').update({ conteudo: { ...c, area }, atualizado_em: new Date().toISOString() }).eq('tenant_id', TENANT_PADRAO).eq('id', p.id);
    if (e) throw e;
  }));
}

export async function atualizar(id: string, dados: { nome?: string; area_id?: string; descricao?: string }) {
  const novaArea = dados.area_id ? await garantirArea(dados.area_id) : null;
  const db = supabase();
  const { data: antes, error: e1 } = await db.from('processos').select('area_id, area:areas(nome)').eq('tenant_id', TENANT_PADRAO).eq('id', id).maybeSingle();
  if (e1) throw e1;
  if (!antes) throw new ErroApi(404, 'Processo não encontrado');
  const { data, error } = await db.from('processos').update({ ...dados, atualizado_em: new Date().toISOString() })
    .eq('tenant_id', TENANT_PADRAO).eq('id', id).select('id').maybeSingle();
  if (error) throw error;
  if (!data) throw new ErroApi(404, 'Processo não encontrado');
  // Mudou de área: o campo "Área" dos POPs do processo acompanha.
  if (novaArea && antes.area_id !== novaArea.id) await sincronizarAreaDosPops(id, (antes.area as { nome?: string } | null)?.nome ?? null, novaArea.nome);
  // A descrição mudou: o índice de referências acompanha (decisão 35).
  if (dados.descricao !== undefined) await referencias.indexar({ tipo: 'processo', id }, [{ campo: 'descricao', valor: dados.descricao }]);
  return data;
}

/**
 * Ícone do processo (decisão 133): a pessoa escolhe um ícone do Lucide e, se quiser, a cor. O navegador manda só o nome;
 * o desenho guardado é o do catálogo do servidor. Com `nome` nulo, o processo volta ao quadradinho colorido. É só
 * aparência: não mexe na data de atualização nem conta como alteração a publicar.
 */
export async function definirIcone(id: string, nome: string | null, cor: number | null) {
  const icone = nome ? montarIcone(nome, cor) : null;
  const { data, error } = await supabase().from('processos').update({ icone }).eq('tenant_id', TENANT_PADRAO).eq('id', id).select('id').maybeSingle();
  if (error) throw error;
  if (!data) throw new ErroApi(404, 'Processo não encontrado');
  return { icone };
}

/**
 * Chave da página pública do processo (decisão 35): online mostra a versão publicada e os POPs publicados; offline,
 * "não disponível". Só liga depois de a pessoa publicar o processo (decisão 129).
 */
export async function definirLinkPublico(id: string, ativo: boolean) {
  const { data: p, error: e1 } = await supabase().from('processos').select('id, arquivado_em, publicado_em').eq('tenant_id', TENANT_PADRAO).eq('id', id).maybeSingle();
  if (e1) throw e1;
  if (!p) throw new ErroApi(404, 'Processo não encontrado');
  if (ativo && p.arquivado_em) throw new ErroApi(409, 'O processo está arquivado: restaure-o antes de colocar a página no ar.');
  if (ativo && !p.publicado_em) throw new ErroApi(409, 'Publique o processo para poder colocar a página pública no ar.');
  const { error } = await supabase().from('processos').update({ link_publico_ativo: ativo }).eq('tenant_id', TENANT_PADRAO).eq('id', id);
  if (error) throw error;
  return { link_publico_ativo: ativo };
}

/** Arquivar tira o processo das listas com tudo o que tem dentro; nada é apagado (decisão 31). */
export async function arquivar(id: string, arquivado: boolean) {
  const { data, error } = await supabase().from('processos').update({ arquivado_em: arquivado ? new Date().toISOString() : null, atualizado_em: new Date().toISOString() })
    .eq('tenant_id', TENANT_PADRAO).eq('id', id).select('id, arquivado_em').maybeSingle();
  if (error) throw error;
  if (!data) throw new ErroApi(404, 'Processo não encontrado');
  return data;
}

/** Move um item para outro processo (ou para fora, com null). */
export async function mover(tabela: 'fluxogramas' | 'gravacoes' | 'pops', itemId: string, processoId: string | null) {
  if (processoId) await garantir(processoId);
  const { data, error } = await supabase().from(tabela).update({ processo_id: processoId }).eq('tenant_id', TENANT_PADRAO).eq('id', itemId).select('id').maybeSingle();
  if (error) throw error;
  if (!data) throw new ErroApi(404, 'Item não encontrado');
  await tocar(processoId);
  return data;
}
