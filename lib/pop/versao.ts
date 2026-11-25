// Versionamento do POP (decisão 138). As regras da versão (X.Y.Z, tamanho da alteração, "O que mudou") são as mesmas
// do processo e ficam em `lib/versao.ts`; aqui fica o que é só do POP: as palavras dele e a tabela "Históricos de
// Revisões" do documento.
import { compararVersoes, ROTULOS_POR_DOCUMENTO, TIPOS_POR_DOCUMENTO, type VersaoPublicada } from '@/lib/versao';
import type { Historico } from './schema';

export * from '@/lib/versao';
export const TIPOS_DE_ALTERACAO = TIPOS_POR_DOCUMENTO.pop;
export const ROTULO_DO_TIPO = ROTULOS_POR_DOCUMENTO.pop;
export type VersaoDoPop = VersaoPublicada;

const dataBr = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
/** A linha da versão na tabela "Históricos de Revisões" do documento (PDF e página pública). */
export const linhaDoHistorico = (v: VersaoDoPop): Historico => ({
  data: dataBr(v.publicado_em),
  elaborado_por: v.publicado_por,
  revisao: `${v.versao} · ${v.tipo === 'primeira' ? '' : `${ROTULO_DO_TIPO[v.tipo]}: `}${v.o_que_mudou}`,
});
/** O histórico do documento: uma linha por versão, da mais antiga para a mais nova, até `ate` (se dado). */
export const historicoDasVersoes = (versoes: VersaoDoPop[], ate?: string): Historico[] =>
  versoes.filter((v) => !ate || compararVersoes(v.versao, ate) <= 0).sort((a, b) => compararVersoes(a.versao, b.versao)).map(linhaDoHistorico);
