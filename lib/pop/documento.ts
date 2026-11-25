// O que o documento do POP (a página pública e o PDF, decisão 140) usa para se montar: os dados, o cabeçalho, as
// etapas com os passos numerados e o tamanho dos prints no PDF. O POP sai só em PDF (decisão 79).
import type { ConteudoPop, Historico, Passo } from './schema';
import { textoPuro } from './texto-rico';

export type DadosPop = ConteudoPop & {
  nome: string;
  codigo: string;
  identificacao: string;
  versao: string;
  autor: string; // "Elaborado por": quem criou o POP
  criado_em: string; // ISO
  /** A organização do processo do POP: vai no rodapé de cada página. */
  organizacao?: string | null;
  link_fluxograma?: string | null;
  historico: Historico[];
  /** Referências do texto (decisão 35), por "tipo:id": nome atual e link da página pública do destino. */
  referencias?: Record<string, { rotulo?: string; url: string | null }>;
};

export const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
export const DESCRICAO_FLUXOGRAMA = 'Diagrama do fluxo ponta a ponta';

/** Dados do cabeçalho do POP (mês/ano, data de criação, envolvidos e histórico). */
export function cabecalho(dados: DadosPop) {
  const criado = new Date(dados.criado_em);
  return {
    mesAno: `${MESES[criado.getMonth()]}/${criado.getFullYear()}`,
    dataCriacao: criado.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
    envolvidos: dados.envolvidos.filter((e) => e.area || e.cargo),
    historico: dados.historico.map((h) => ({ data: h.data, elaboradoPor: h.elaborado_por.trim() || dados.autor, revisao: h.revisao })),
  };
}

export type PassoDoDocumento = { numero: number; /** Texto com formatação (texto-rico.ts); vazio se o passo só tem print. */ texto: string; /** Caminho do print, se ele existe. */ imagem: string | null; passo: Passo };
export type EtapaDoDocumento = { /** Posição da etapa no POP, a partir de 1. */ ordem: number; nome: string; passos: PassoDoDocumento[] };

/**
 * As etapas do POP como o documento mostra, na página e no PDF: só as que têm passo escrito ou com print, com os
 * passos numerados do início ao fim do POP. `temImagem` diz se o print daquele caminho está disponível.
 */
export function etapasDoDocumento(procedimentos: ConteudoPop['procedimentos'], temImagem: (caminho: string) => boolean): EtapaDoDocumento[] {
  let numero = 0;
  return procedimentos.map((p, i) => ({
    ordem: i + 1,
    nome: p.nome.trim(),
    passos: p.passos
      .map((s) => ({ texto: textoPuro(s.texto) ? s.texto : '', imagem: s.imagem_caminho && temImagem(s.imagem_caminho) ? s.imagem_caminho : null, passo: s }))
      .filter((s) => s.texto || s.imagem)
      .map((s) => ({ numero: ++numero, ...s })),
  })).filter((e) => e.passos.length > 0);
}

/**
 * Tamanho do print dentro do cartão do passo no PDF (pontos), mantendo a proporção: ocupa a largura do cartão, sem
 * passar da altura máxima (um print em pé fica menor e centralizado) nem ampliar além de 1 ponto por pixel.
 */
export function tamanhoImagemPt(largura: number, altura: number, larguraMax: number, alturaMax: number) {
  const l = Math.max(1, largura), a = Math.max(1, altura);
  const escala = Math.min(larguraMax / l, alturaMax / a, 1);
  return { largura: l * escala, altura: a * escala };
}
