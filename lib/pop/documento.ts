// O que o PDF do POP usa para montar o documento no layout do Modelo POP v3: os dados, as cores do modelo,
// o cabeçalho, a sequência de passos e o tamanho dos prints. O POP sai só em PDF (decisão 79).
import type { ConteudoPop, Historico, Passo } from './schema';
import { textoPuro } from './texto-rico';

export type DadosPop = ConteudoPop & {
  nome: string;
  codigo: string;
  identificacao: string;
  versao: string;
  autor: string; // "Elaborado por": quem criou o POP
  criado_em: string; // ISO
  link_fluxograma?: string | null;
  historico: Historico[];
  /** Referências do texto (decisão 35), por "tipo:id": nome atual e link da página pública do destino. */
  referencias?: Record<string, { rotulo?: string; url: string | null }>;
};

export const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
export const DESCRICAO_FLUXOGRAMA = 'Diagrama do fluxo ponta a ponta';

// Cores do modelo
export const COR_AZUL = '0E2841'; // títulos
export const COR_TEXTO = '182737';
export const COR_CAIXA_FUNDO = 'FFF4E0'; // caixa do passo (creme)
export const COR_CAIXA_BARRA = 'F28C28'; // barra laranja à esquerda
export const COR_CAIXA_BORDA = 'F3D3A8';
export const COR_CAIXA_ROTULO = 'B45309';
export const COR_BORDA_IMAGEM = 'D5DDDC';

const LARGURA_UTIL_EMU = 6_000_000; // ~16,6 cm (área útil da página A4 do modelo)
const ALTURA_MAX_EMU = 5_400_000; // ~15 cm, para caber na página

/** Dados do cabeçalho do POP (mês/ano, data de criação, envolvidos e histórico). */
export function cabecalho(dados: DadosPop) {
  const criado = new Date(dados.criado_em);
  return {
    mesAno: `${MESES[criado.getMonth()]}/${criado.getFullYear()}`,
    dataCriacao: criado.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
    envolvidos: dados.envolvidos.length ? dados.envolvidos : [{ area: '—', cargo: '—' }],
    historico: dados.historico.map((h) => ({ data: h.data, elaboradoPor: h.elaborado_por.trim() || dados.autor, revisao: h.revisao })),
  };
}

/**
 * Sequência dos procedimentos como o modelo mostra: cada passo é o print (se houver) com o texto
 * numa caixa logo abaixo, numerados do início ao fim do POP. O nome do grupo vira um subtítulo.
 */
export function sequenciaPassos(dados: DadosPop) {
  const itens: ({ tipo: 'subtitulo'; texto: string } | { tipo: 'passo'; numero: number; texto: string; passo: Passo })[] = [];
  let n = 0;
  for (const p of dados.procedimentos) {
    // `texto` do passo pode ter formatação (texto-rico.ts); "vazio" é sem nenhum texto.
    const passos = p.passos.filter((s) => textoPuro(s.texto) || s.imagem_caminho);
    if (!passos.length) continue;
    if (p.nome.trim()) itens.push({ tipo: 'subtitulo', texto: p.nome.trim() });
    for (const s of passos) itens.push({ tipo: 'passo', numero: ++n, texto: textoPuro(s.texto) ? s.texto : '', passo: s });
  }
  return itens;
}

/** Tamanho do print na página (pontos), mantendo a proporção. */
export function tamanhoImagemPt(largura: number, altura: number) {
  const { cx, cy } = tamanhoImagem(largura, altura);
  return { largura: cx / 12700, altura: cy / 12700 };
}

function tamanhoImagem(largura: number, altura: number) {
  let cx = LARGURA_UTIL_EMU;
  let cy = Math.round((cx * altura) / Math.max(1, largura));
  if (cy > ALTURA_MAX_EMU) {
    cx = Math.round((cx * ALTURA_MAX_EMU) / cy);
    cy = ALTURA_MAX_EMU;
  }
  return { cx, cy };
}
