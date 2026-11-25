// Versionamento dos documentos publicados (decisões 138 e 139): o POP e o processo. A versão é X.Y.Z e quem a dá é o
// INCFlow, na publicação: a pessoa escolhe o tamanho da alteração e escreve o que mudou. Cada documento tem a sua
// versão; a do processo não depende das dos POPs. Este módulo não depende do navegador nem do servidor.

/** O que tem versão. */
export type DocumentoVersionado = 'pop' | 'processo';
/** O tamanho da alteração, escolhido por quem publica. */
export type TipoDeAlteracao = 'correcao' | 'ajuste' | 'mudanca';
/** A primeira publicação não tem tamanho: é a versão 1.0.0. */
export type TipoDeVersao = 'primeira' | TipoDeAlteracao;

type Opcao = { id: TipoDeAlteracao; nome: string; resumo: string; exemplo: string };
/** As opções da janela de publicar, com as palavras de cada documento. */
export const TIPOS_POR_DOCUMENTO: Record<DocumentoVersionado, Opcao[]> = {
  pop: [
    { id: 'correcao', nome: 'Correção', resumo: 'Não muda o que a pessoa faz.', exemplo: 'Erro de digitação, print trocado, texto mais claro.' },
    { id: 'ajuste', nome: 'Ajuste', resumo: 'Muda um detalhe; o jeito de fazer continua o mesmo.', exemplo: 'Passo novo ou mais detalhado, envolvido novo, ordem dos passos.' },
    { id: 'mudanca', nome: 'Mudança no procedimento', resumo: 'O jeito de fazer mudou.', exemplo: 'Quem executa precisa ser avisado da versão nova.' },
  ],
  processo: [
    { id: 'correcao', nome: 'Correção', resumo: 'Não muda como o processo funciona.', exemplo: 'Erro de digitação, texto mais claro, aparência do fluxograma.' },
    { id: 'ajuste', nome: 'Ajuste', resumo: 'Muda um detalhe; o caminho continua o mesmo.', exemplo: 'Etapa mais detalhada, anotação nova, descrição complementada.' },
    { id: 'mudanca', nome: 'Mudança no processo', resumo: 'O caminho mudou.', exemplo: 'Etapas, decisões ou responsáveis diferentes. Quem participa precisa ser avisado.' },
  ],
};
export const ROTULOS_POR_DOCUMENTO: Record<DocumentoVersionado, Record<TipoDeVersao, string>> = {
  pop: { primeira: 'Primeira versão', correcao: 'Correção', ajuste: 'Ajuste', mudanca: 'Mudança no procedimento' },
  processo: { primeira: 'Primeira versão', correcao: 'Correção', ajuste: 'Ajuste', mudanca: 'Mudança no processo' },
};

/** "O que mudou" é obrigatório a partir da segunda publicação, com tamanho mínimo e máximo. */
export const MIN_O_QUE_MUDOU = 10;
export const MAX_O_QUE_MUDOU = 300;
export const TEXTO_DA_PRIMEIRA_VERSAO = 'Versão inicial.';

export type NumeroDaVersao = [maior: number, menor: number, correcao: number];
export const PRIMEIRA_VERSAO: NumeroDaVersao = [1, 0, 0];
export const textoDaVersao = (n: NumeroDaVersao) => n.join('.');
/** Lê "1.2.0"; devolve null para o que não for uma versão (inclusive o "1.0" de antes do versionamento). */
export function lerVersao(t: string | null | undefined): NumeroDaVersao | null {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec((t ?? '').trim());
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}
/** A versão que sai: correção sobe o último número, ajuste o do meio, mudança o primeiro (e zera os seguintes). */
export function proximaVersao(atual: NumeroDaVersao | null, tipo: TipoDeAlteracao): NumeroDaVersao {
  if (!atual) return PRIMEIRA_VERSAO;
  const [x, y, z] = atual;
  return tipo === 'correcao' ? [x, y, z + 1] : tipo === 'ajuste' ? [x, y + 1, 0] : [x + 1, 0, 0];
}
/** Compara duas versões ("1.2.0" e "1.10.0"): negativo se a primeira é mais antiga. */
export function compararVersoes(a: string, b: string) {
  const [x, y] = [lerVersao(a) ?? [0, 0, 0], lerVersao(b) ?? [0, 0, 0]];
  return x[0] - y[0] || x[1] - y[1] || x[2] - y[2];
}

/** Uma versão publicada, como a aba Versões mostra. */
export type VersaoPublicada = { versao: string; tipo: TipoDeVersao; o_que_mudou: string; publicado_por: string; publicado_em: string };
/** O que a pessoa informa ao publicar a partir da segunda versão. */
export type PedidoDePublicacao = { tipo?: TipoDeAlteracao; o_que_mudou?: string };
