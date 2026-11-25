import 'server-only';
import { textoDaVersao, lerVersao, type NumeroDaVersao, type TipoDeVersao, type VersaoDoPop } from '@/lib/pop/versao';
import { ErroApi } from './http';
import { TENANT_PADRAO, supabase } from './supabase';

// As versões publicadas do POP (decisão 138, tabela `pop_versoes`): uma linha por publicação, com o número X.Y.Z, o
// tamanho da alteração, o que mudou, quem publicou e a cópia do documento daquele dia.

type Linha = { maior: number; menor: number; correcao: number; tipo: TipoDeVersao; o_que_mudou: string; publicado_por: string; publicado_em: string };
const RESUMO = 'maior, menor, correcao, tipo, o_que_mudou, publicado_por, publicado_em';
const paraVersao = (l: Linha): VersaoDoPop => ({ versao: textoDaVersao([l.maior, l.menor, l.correcao]), tipo: l.tipo, o_que_mudou: l.o_que_mudou, publicado_por: l.publicado_por, publicado_em: l.publicado_em });
// Enquanto a migração 0031 não foi aplicada, a tabela não existe: ler devolve "nenhuma versão" em vez de derrubar a
// página (a pública continua mostrando a cópia publicada); publicar continua dando erro, que é o certo.
const semTabela = (e: unknown) => ['42P01', 'PGRST205'].includes((e as { code?: string } | null)?.code ?? '');
const consulta = (popId: string, campos: string) => supabase().from('pop_versoes').select(campos).eq('tenant_id', TENANT_PADRAO).eq('pop_id', popId);

/** As versões do POP, da mais nova para a mais antiga (sem a cópia do documento). */
export async function listar(popId: string): Promise<VersaoDoPop[]> {
  const { data, error } = await consulta(popId, RESUMO).order('maior', { ascending: false }).order('menor', { ascending: false }).order('correcao', { ascending: false });
  if (error) { if (semTabela(error)) return []; throw error; }
  return ((data ?? []) as unknown as Linha[]).map(paraVersao);
}

/** A última versão publicada, com o mapa das cópias dos prints (para a seguinte reaproveitar). Nula: nunca publicado. */
export async function ultima(popId: string): Promise<{ numero: NumeroDaVersao; versao: string; copias: Record<string, string> } | null> {
  const { data, error } = await consulta(popId, 'maior, menor, correcao, copias').order('maior', { ascending: false }).order('menor', { ascending: false }).order('correcao', { ascending: false }).limit(1);
  if (error) throw error;
  const l = (data ?? [])[0] as unknown as (Linha & { copias: Record<string, string> | null }) | undefined;
  if (!l) return null;
  const numero: NumeroDaVersao = [l.maior, l.menor, l.correcao];
  return { numero, versao: textoDaVersao(numero), copias: l.copias ?? {} };
}

/** Uma versão do POP, com a cópia do documento. `versao` é "X.Y.Z". */
export async function buscar<P>(popId: string, versao: string): Promise<VersaoDoPop & { publicacao: P }> {
  const n = lerVersao(versao);
  if (!n) throw new ErroApi(404, 'Versão não encontrada');
  const { data, error } = await consulta(popId, `${RESUMO}, publicacao`).eq('maior', n[0]).eq('menor', n[1]).eq('correcao', n[2]).maybeSingle();
  if (error) throw error;
  if (!data) throw new ErroApi(404, 'Versão não encontrada');
  const l = data as unknown as Linha & { publicacao: P };
  return { ...paraVersao(l), publicacao: l.publicacao };
}

/** Guarda a versão nova. Duas publicações ao mesmo tempo dariam o mesmo número: a segunda é recusada. */
export async function registrar(popId: string, v: { numero: NumeroDaVersao; tipo: TipoDeVersao; o_que_mudou: string; publicado_por: string; publicado_por_id: string | null; publicado_em: string; publicacao: unknown; copias: Record<string, string> }) {
  const { error } = await supabase().from('pop_versoes').insert({
    tenant_id: TENANT_PADRAO, pop_id: popId, maior: v.numero[0], menor: v.numero[1], correcao: v.numero[2], tipo: v.tipo, o_que_mudou: v.o_que_mudou,
    publicado_por: v.publicado_por, publicado_por_id: v.publicado_por_id, publicado_em: v.publicado_em, publicacao: v.publicacao, copias: v.copias,
  });
  if (!error) return;
  if ((error as { code?: string }).code === '23505') throw new ErroApi(409, 'Este POP acabou de ser publicado por outra pessoa. Recarregue a página para ver a versão nova.');
  throw error;
}

/** Desfaz o registro de uma versão (a publicação falhou no meio do caminho). */
export async function desfazer(popId: string, numero: NumeroDaVersao) {
  await supabase().from('pop_versoes').delete().eq('tenant_id', TENANT_PADRAO).eq('pop_id', popId).eq('maior', numero[0]).eq('menor', numero[1]).eq('correcao', numero[2]);
}
