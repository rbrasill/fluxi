import 'server-only';
import { historicoDasVersoes } from '@/lib/pop/versao';
import * as anexos from './anexos';
import { ErroApi } from './http';
import * as pops from './pops';
import * as processos from './processos';
import { fluxogramaExposto, paraPublico, type PublicacaoProcesso } from './publicacao';
import * as referencias from './referencias';
import { TENANT_PADRAO, supabase } from './supabase';
import * as telas from './telas';
import * as versoes from './versoes';

// Prévia antes de publicar (decisões 149 e 150): o POP e o processo como estão agora no editor, no formato da página
// pública, para conferir antes de publicar. Não é documento oficial. Abre para qualquer pessoa logada, de qualquer
// perfil (a rota exige o login). Nada é gravado: a prévia é montada na hora.
type Area = { nome: string; organizacao: { nome: string } | null } | null;

/** O POP como sairia se fosse publicado agora, no formato que a página pública recebe. */
export async function previaDoPop(id: string) {
  const pop = await pops.buscar(id);
  const [{ conteudo, arquivos: anexados }, lista] = await Promise.all([pops.estadoFinal(pop), versoes.doPop.listar(id)]);
  const daVersao = anexados.map(({ id: arquivoId, nome, descricao }) => ({ id: arquivoId, nome, descricao }));
  const publicada = lista[0]?.versao ?? null;
  // Há o que publicar: nunca foi publicado ou mudou depois da última versão.
  const pendente = !publicada || pops.temAlteracoes(pop, conteudo, daVersao);
  const historico = historicoDasVersoes(lista);
  if (pendente) historico.push({ data: pops.hoje(), elaborado_por: pop.autor, revisao: publicada ? `Prévia: alterações ainda não publicadas (depois da ${publicada})` : 'Prévia: ainda não publicado' });

  // O fluxograma que a página pública do POP mostra é o publicado com o processo, e só se ele está no ar.
  let fluxograma: { link_publico: string; nome: string; tem_svg: boolean } | null = null;
  if (pop.processo_id) {
    const { data, error } = await supabase().from('processos').select('id, arquivado_em, link_publico_ativo, publicacao').eq('tenant_id', TENANT_PADRAO).eq('id', pop.processo_id).maybeSingle();
    if (error) throw error;
    const f = (data?.publicacao as PublicacaoProcesso | null | undefined)?.fluxograma;
    if (data && f && await fluxogramaExposto(data as { id: string; arquivado_em: string | null; link_publico_ativo: boolean })) fluxograma = { link_publico: f.link_publico, nome: f.nome, tem_svg: true };
  }

  const caminhos = conteudo.procedimentos.flatMap((x) => x.passos.map((s) => s.imagem_caminho)).filter(Boolean) as string[];
  const [imagens, refs, arquivos] = await Promise.all([
    telas.assinar(caminhos).then((m) => Object.fromEntries(m) as Record<string, string>),
    referencias.resolverDosTextos(referencias.textosDoPop(conteudo).map((t) => t.valor)),
    anexos.paraLeitura(id, daVersao),
  ]);
  const area = (pop.processo as unknown as { nome: string; area: Area } | null);
  return {
    nome: pop.nome, codigo: pop.codigo, identificacao: pop.identificacao, autor: pop.autor, criado_em: pop.criado_em,
    versao: pendente ? 'Prévia' : (publicada as string),
    publicado_em: new Date().toISOString(),
    historico, conteudo, arquivos, imagens,
    onde: { organizacao: area?.area?.organizacao?.nome ?? null, area: area?.area?.nome ?? null, processo: area?.nome ?? null },
    processo_link: null,
    fluxograma,
    referencias: paraPublico(refs),
    referenciado_em: [],
    // O que a página da prévia diz no aviso.
    // Desde quando há alteração: a última vez que o POP foi salvo.
    previa: { pendente, versao_publicada: publicada, alterado_em: pop.atualizado_em },
  };
}

/** O processo como sairia se fosse publicado agora: a descrição e o fluxograma de hoje, e os POPs que já estão no ar. */
export async function previaDoProcesso(id: string) {
  const db = supabase();
  const [p, f, o, lista] = await Promise.all([
    db.from('processos').select('id, nome, codigo, descricao, publicado_em, atualizado_em, publicacao_hash:publicacao->>versao_hash, area:areas(nome, organizacao:organizacoes(nome))').eq('tenant_id', TENANT_PADRAO).eq('id', id).maybeSingle(),
    db.from('fluxogramas').select('id, nome, xml, tem_svg').eq('tenant_id', TENANT_PADRAO).eq('processo_id', id).maybeSingle(),
    // Como na página pública: só os POPs publicados e no ar (cada POP tem a sua prévia).
    db.from('pops').select('nome, identificacao, codigo, versao, link_publico, publicado_em').eq('tenant_id', TENANT_PADRAO).eq('processo_id', id)
      .eq('status', 'publicado').eq('link_publico_ativo', true).is('arquivado_em', null).order('identificacao').order('nome'),
    versoes.doProcesso.listar(id),
  ]);
  for (const r of [p, f, o]) if (r.error) throw r.error;
  if (!p.data) throw new ErroApi(404, 'Processo não encontrado');
  const processo = p.data as unknown as { nome: string; codigo: string; descricao: string | null; publicado_em: string | null; atualizado_em: string; publicacao_hash: string | null; area: Area };
  const fluxo = f.data as { id: string; nome: string; xml: string | null; tem_svg: boolean | null } | null;
  const descricao = processo.descricao ?? '';
  const publicada = lista[0]?.versao ?? null;
  const pendente = !processo.publicado_em || processo.publicacao_hash !== processos.hashDoProcesso({ nome: processo.nome, descricao }, fluxo ? { nome: fluxo.nome, xml: fluxo.xml ?? '' } : null);
  return {
    nome: processo.nome, codigo: processo.codigo, descricao,
    onde: { organizacao: processo.area?.organizacao?.nome ?? null, area: processo.area?.nome ?? null, processo: null },
    // A imagem do fluxograma de hoje sai pela rota do app (`/api/fluxogramas/<id>/svg`).
    fluxograma: fluxo ? { id: fluxo.id, nome: fluxo.nome, tem_svg: !!fluxo.tem_svg } : null,
    pops: (o.data ?? []).map((x) => ({ nome: x.nome as string, identificacao: (x.identificacao as string) || null, codigo: x.codigo as string, versao: x.versao as string, link_publico: x.link_publico as string, publicado_em: x.publicado_em as string | null })),
    referencias: paraPublico(await referencias.resolverDosTextos([descricao])),
    previa: { pendente, versao_publicada: publicada, alterado_em: processo.atualizado_em },
  };
}
