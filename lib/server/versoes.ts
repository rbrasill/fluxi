import 'server-only';
import { lerVersao, MAX_O_QUE_MUDOU, MIN_O_QUE_MUDOU, PRIMEIRA_VERSAO, proximaVersao, TEXTO_DA_PRIMEIRA_VERSAO, textoDaVersao, type NumeroDaVersao, type PedidoDePublicacao, type TipoDeAlteracao, type TipoDeVersao, type VersaoPublicada } from '@/lib/versao';
import { ErroApi } from './http';
import { TENANT_PADRAO, supabase } from './supabase';

// As versões publicadas do POP (decisão 138, tabela `pop_versoes`) e do processo (decisão 139, `processo_versoes`):
// uma linha por publicação, com o número X.Y.Z, o tamanho da alteração, o que mudou, quem publicou e a cópia do
// documento daquele dia. As duas tabelas têm as mesmas colunas, fora o que é próprio de cada documento (`extras`).

type Linha = { maior: number; menor: number; correcao: number; tipo: TipoDeVersao; o_que_mudou: string; publicado_por: string; publicado_em: string };
const RESUMO = 'maior, menor, correcao, tipo, o_que_mudou, publicado_por, publicado_em';
const paraVersao = (l: Linha): VersaoPublicada => ({ versao: textoDaVersao([l.maior, l.menor, l.correcao]), tipo: l.tipo, o_que_mudou: l.o_que_mudou, publicado_por: l.publicado_por, publicado_em: l.publicado_em });
// Enquanto a migração da tabela não foi aplicada, ela não existe: ler devolve "nenhuma versão" em vez de derrubar a
// página (a pública continua mostrando a cópia publicada); publicar continua dando erro, que é o certo.
const semTabela = (e: unknown) => ['42P01', 'PGRST205'].includes((e as { code?: string } | null)?.code ?? '');

export type NovaVersao = { numero: NumeroDaVersao; tipo: TipoDeVersao; o_que_mudou: string; publicado_por: string; publicado_por_id: string | null; publicado_em: string; publicacao: unknown };

function repositorio<Extras extends Record<string, unknown>>(tabela: 'pop_versoes' | 'processo_versoes', dono: 'pop_id' | 'processo_id', colunasExtras: string) {
  const consulta = (id: string, campos: string) => supabase().from(tabela).select(campos).eq('tenant_id', TENANT_PADRAO).eq(dono, id);
  const maisNovaPrimeiro = (id: string, campos: string) => consulta(id, campos).order('maior', { ascending: false }).order('menor', { ascending: false }).order('correcao', { ascending: false });
  return {
    /** As versões, da mais nova para a mais antiga (sem a cópia do documento). */
    async listar(id: string): Promise<VersaoPublicada[]> {
      const { data, error } = await maisNovaPrimeiro(id, RESUMO);
      if (error) { if (semTabela(error)) return []; throw error; }
      return ((data ?? []) as unknown as Linha[]).map(paraVersao);
    },
    /** A última versão publicada, com as colunas próprias do documento. Nula: nunca publicado. */
    async ultima(id: string): Promise<({ numero: NumeroDaVersao; versao: string } & Partial<Extras>) | null> {
      const { data, error } = await maisNovaPrimeiro(id, `maior, menor, correcao${colunasExtras ? `, ${colunasExtras}` : ''}`).limit(1);
      if (error) throw error;
      const l = (data ?? [])[0] as unknown as (Linha & Partial<Extras>) | undefined;
      if (!l) return null;
      const { maior, menor, correcao, ...extras } = l;
      const numero: NumeroDaVersao = [maior, menor, correcao];
      return { numero, versao: textoDaVersao(numero), ...(extras as unknown as Partial<Extras>) };
    },
    /** Uma versão, com a cópia do documento e as colunas próprias. `versao` é "X.Y.Z". */
    async buscar<P>(id: string, versao: string): Promise<VersaoPublicada & { publicacao: P } & Partial<Extras>> {
      const n = lerVersao(versao);
      if (!n) throw new ErroApi(404, 'Versão não encontrada');
      const { data, error } = await consulta(id, `${RESUMO}, publicacao${colunasExtras ? `, ${colunasExtras}` : ''}`).eq('maior', n[0]).eq('menor', n[1]).eq('correcao', n[2]).maybeSingle();
      if (error) throw error;
      if (!data) throw new ErroApi(404, 'Versão não encontrada');
      const { maior, menor, correcao, tipo, o_que_mudou, publicado_por, publicado_em, ...resto } = data as unknown as Linha & { publicacao: P } & Partial<Extras>;
      return { ...paraVersao({ maior, menor, correcao, tipo, o_que_mudou, publicado_por, publicado_em }), ...(resto as unknown as { publicacao: P } & Partial<Extras>) };
    },
    /** Guarda a versão nova. Duas publicações ao mesmo tempo dariam o mesmo número: a segunda é recusada. */
    async registrar(id: string, v: NovaVersao, extras: Extras) {
      const linha: Record<string, unknown> = {
        tenant_id: TENANT_PADRAO, [dono]: id, maior: v.numero[0], menor: v.numero[1], correcao: v.numero[2], tipo: v.tipo, o_que_mudou: v.o_que_mudou,
        publicado_por: v.publicado_por, publicado_por_id: v.publicado_por_id, publicado_em: v.publicado_em, publicacao: v.publicacao, ...extras,
      };
      const { error } = await supabase().from(tabela).insert(linha);
      if (!error) return;
      if ((error as { code?: string }).code === '23505') throw new ErroApi(409, `Este ${tabela === 'pop_versoes' ? 'POP' : 'processo'} acabou de ser publicado por outra pessoa. Recarregue a página para ver a versão nova.`);
      throw error;
    },
    /** Desfaz o registro de uma versão (a publicação falhou no meio do caminho). */
    async desfazer(id: string, numero: NumeroDaVersao) {
      await supabase().from(tabela).delete().eq('tenant_id', TENANT_PADRAO).eq(dono, id).eq('maior', numero[0]).eq('menor', numero[1]).eq('correcao', numero[2]);
    },
  };
}

/** Versões do POP. `copias`: de qual print (caminho no editor) veio cada cópia, para a versão seguinte reaproveitar. */
export const doPop = repositorio<{ copias: Record<string, string> }>('pop_versoes', 'pop_id', 'copias');
/** Versões do processo. `publicacao_svg`: a imagem do fluxograma daquele dia. */
export const doProcesso = repositorio<{ publicacao_svg: string | null }>('processo_versoes', 'processo_id', 'publicacao_svg');

/**
 * O número, o tamanho e o texto da versão que vai sair. A primeira publicação é a 1.0.0 e não pede nada; as seguintes
 * pedem o tamanho da alteração (que define o número) e o que mudou, com tamanho mínimo e máximo.
 */
export function proxima(anterior: { numero: NumeroDaVersao } | null, pedido: PedidoDePublicacao, mudanca: string): { numero: NumeroDaVersao; versao: string; tipo: TipoDeVersao; o_que_mudou: string } {
  if (!anterior) return { numero: PRIMEIRA_VERSAO, versao: textoDaVersao(PRIMEIRA_VERSAO), tipo: 'primeira', o_que_mudou: TEXTO_DA_PRIMEIRA_VERSAO };
  if (!pedido.tipo) throw new ErroApi(400, `Escolha o tamanho da alteração: correção, ajuste ou ${mudanca}.`);
  const texto = (pedido.o_que_mudou ?? '').replace(/\s+/g, ' ').trim();
  if (texto.length < MIN_O_QUE_MUDOU) throw new ErroApi(400, `Diga o que mudou, com pelo menos ${MIN_O_QUE_MUDOU} caracteres.`);
  if (texto.length > MAX_O_QUE_MUDOU) throw new ErroApi(400, `Resuma o que mudou em até ${MAX_O_QUE_MUDOU} caracteres.`);
  const numero = proximaVersao(anterior.numero, pedido.tipo as TipoDeAlteracao);
  return { numero, versao: textoDaVersao(numero), tipo: pedido.tipo, o_que_mudou: texto };
}
