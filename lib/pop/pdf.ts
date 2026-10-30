// Gera o POP em PDF com o mesmo conteúdo e o visual do Modelo POP v3, sem depender do Word.
// Usa o pdfmake (JavaScript puro, roda na Vercel). Fontes e imagens do modelo vêm de templates/pop/.
//
// O layout segue o modelo parágrafo por parágrafo, com as regras do Word medidas no PDF que o
// próprio Word exporta (ver docs/decisoes.md, decisão 24):
//  - cada linha tem 1,222 × o tamanho da fonte × a entrelinha do parágrafo, com o texto no topo;
//  - os parágrafos vazios do modelo (espaçadores de 7, 9, 10, 12 e 18 pt) entram como estão;
//  - tabelas com as margens de célula, alturas mínimas e alinhamento vertical do modelo;
//  - ícones, réguas e a faixa nas posições (deslocamentos) das âncoras do DOCX.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import pdfmake from 'pdfmake';
import {
  COR_AZUL, COR_BORDA_IMAGEM, COR_CAIXA_BARRA, COR_CAIXA_BORDA, COR_CAIXA_FUNDO, COR_CAIXA_ROTULO, COR_TEXTO,
  DESCRICAO_FLUXOGRAMA, cabecalho, sequenciaPassos, tamanhoImagemPt, type DadosPop,
} from './docx';
import { colunas, lerTexto, linhasDeCabecalho, type Bloco as BlocoTexto, type Trecho } from './texto-rico';

const PASTA = () => path.join(process.cwd(), 'templates/pop');
const AZUL = `#${COR_AZUL}`;
const TEXTO = `#${COR_TEXTO}`;
const LARANJA = '#FF7D01';
const FUNDO_SECAO = '#E2EAFC';
const CINZA_REGUA = '#808080'; // tx1 com lumMod/lumOff 50%
const CINZA_TRACO = '#BFBFBF'; // linha de "─" do modelo
const BORDA_TABELA = '#BFBFBF'; // Table Grid Light e Plain Table 1
const BORDA_RECURSOS = '#7F7F7F'; // Plain Table 2
const FAIXA_TABELA = '#F2F2F2'; // linhas alternadas do histórico
const LINK = '#005F73';

// Página A4 com as margens do modelo (em pontos): esquerda 1134, topo 1134, direita 1274, base 568 twips.
const MARGENS: [number, number, number, number] = [56.7, 56.7, 63.7, 28.4];
const LARGURA = 474.9; // largura útil (9498 twips)
const LARGURA_CAIXA = 472.45; // caixa de passo sem print (9449 twips)
const MARGEM_CELULA = 5.4; // margem padrão de célula do Word (108 twips)

// Entrelinha: o Word usa 1,222 × o tamanho da fonte (Aptos); a Roboto no pdfkit, 1,1719.
const FATOR_WORD = 1.222;
const lh = (multiplo = 1) => (FATOR_WORD / 1.1719) * multiplo;
const alturaLinha = (pt: number, multiplo = 1) => pt * FATOR_WORD * multiplo;
const ENTRELINHA_PADRAO = 278 / 240; // docDefaults do modelo (parágrafos sem estilo)

/** Largura do conteúdo de uma coluna (o pdfmake soma o padding à largura). */
const larguraCol = (twips: number, esquerda = MARGEM_CELULA, direita = MARGEM_CELULA) => twips / 20 - esquerda - direita;
const dataUrl = (png: Buffer | Uint8Array) => `data:image/png;base64,${Buffer.from(png).toString('base64')}`;

// Tipos mínimos do documento do pdfmake usados aqui.
type Bloco = Record<string, unknown>;

let pronto: Promise<Record<string, string>> | null = null;
/** Registra as fontes e carrega as imagens do modelo uma vez por processo. */
function preparar() {
  pronto ??= (async () => {
    const fontes = path.join(PASTA(), 'fontes');
    const arquivos = ['Roboto-Regular.ttf', 'Roboto-Bold.ttf', 'Roboto-Italic.ttf', 'Roboto-BoldItalic.ttf'];
    await Promise.all(arquivos.map(async (a) => pdfmake.virtualfs.writeFileSync(a, await readFile(path.join(fontes, a)))));
    pdfmake.addFonts({ Roboto: { normal: arquivos[0], bold: arquivos[1], italics: arquivos[2], bolditalics: arquivos[3] } });
    // Nada vem de fora: nem arquivos locais por caminho, nem URLs.
    pdfmake.setLocalAccessPolicy(() => false);
    pdfmake.setUrlAccessPolicy(() => false);
    const nomes = ['faixa', 'logo', 'area', 'procedimento', 'executor', 'objetivo', 'decoracao', 'envolvidos', 'recursos', 'procedimentos'];
    const pares = await Promise.all(nomes.map(async (n) => [n, dataUrl(await readFile(path.join(PASTA(), 'imagens', `${n}.png`)))] as const));
    return Object.fromEntries(pares);
  })();
  return pronto;
}

/** Parágrafo vazio do modelo (espaçador), com o tamanho de fonte da marca de parágrafo. */
const vazio = (pt = 12, multiplo = 1, antes = 0): Bloco => ({ text: ' ', fontSize: pt, lineHeight: lh(multiplo), margin: [0, antes, 0, 0] });

/** Parágrafo de 12 pt com uma régua desenhada (forma ancorada no modelo) a `y` do topo dele. */
function paragrafoComRegua(regua: { x?: number; y: number; w: number; h: number; cor: string }, alturaParagrafo = alturaLinha(12)): Bloco {
  return { canvas: [{ type: 'rect', x: regua.x ?? 0, y: regua.y, w: regua.w, h: regua.h, color: regua.cor }], margin: [0, 0, 0, Math.max(0, alturaParagrafo - regua.y - regua.h)] };
}

const semBordas = (padding: { esquerda?: number; direita?: number; cima?: number; baixo?: number } = {}) => ({
  hLineWidth: () => 0, vLineWidth: () => 0,
  paddingLeft: () => padding.esquerda ?? MARGEM_CELULA, paddingRight: () => padding.direita ?? MARGEM_CELULA,
  paddingTop: () => padding.cima ?? 0, paddingBottom: () => padding.baixo ?? 0,
});

/**
 * Barra de título de seção (tabela de uma célula, fundo azul-claro, margens de 57 twips em cima e embaixo),
 * com o ícone e a decoração nas posições das âncoras do modelo.
 */
function secao(titulo: string, icone: { nome: string; tamanho: number; y: number }, decoracao: { x: number; y: number }): Bloco {
  return {
    table: {
      widths: [larguraCol(9488)],
      body: [[{
        stack: [
          { image: icone.nome, width: icone.tamanho, relativePosition: { x: 0, y: icone.y } },
          { image: 'decoracao', width: 39.5, relativePosition: { x: decoracao.x, y: decoracao.y } },
          { text: titulo, fontSize: 16, bold: true, color: AZUL, margin: [25.9, 0, 0, 0] },
        ],
      }]],
    },
    layout: { ...semBordas({ cima: 2.85, baixo: 2.85 }), fillColor: () => FUNDO_SECAO },
  };
}

/** Item de lista numerada do modelo ("1." ou "A."): número no recuo da lista e texto alinhado depois dele. */
const itemLista = (numero: string, texto: string, recuoNumero: number): Bloco => ({
  columns: [{ width: recuoNumero, text: '' }, { width: 18, text: numero }, { width: '*', text: texto || ' ' }],
});

// --- Texto com formatação (texto-rico.ts), igual ao DOCX: mesmas marcas, listas e recuos ---

const RECUO_LISTA = 18; // pt por nível (360 twips no DOCX)
const MARCADORES = ['disc', 'circle', 'square'];
const NUMERACOES = ['decimal', 'lower-alpha', 'lower-roman'];

const trechosPdf = (trechos: Trecho[]) => trechos.map((t) => {
  const decoracao = [t.sublinhado && 'underline', t.tachado && 'lineThrough'].filter(Boolean) as string[];
  return {
    text: t.texto,
    ...(t.negrito ? { bold: true } : {}),
    ...(t.italico ? { italics: true } : {}),
    ...(decoracao.length ? { decoration: decoracao } : {}),
    ...(t.cor ? { color: t.cor } : {}),
    ...(t.fundo ? { background: t.fundo } : {}),
  };
});

function aparar(blocos: BlocoTexto[]) {
  const vazio = (b: BlocoTexto) => b.tipo === 'paragrafo' && !b.trechos.some((t) => t.texto.trim());
  let i = 0, f = blocos.length;
  while (i < f && vazio(blocos[i])) i++;
  while (f > i && vazio(blocos[f - 1])) f--;
  return blocos.slice(i, f);
}

/** Blocos do pdfmake; `inicio` entra no começo do primeiro parágrafo (o rótulo "Passo N:"). */
function textoRicoPdf(valor: string, inicio: Bloco[] = []): Bloco[] {
  let prefixo = inicio;
  const paragrafo = (trechos: Trecho[]): Bloco => {
    const runs = [...prefixo, ...trechosPdf(trechos)];
    prefixo = [];
    return { text: runs.length ? runs : ' ' };
  };
  const blocos = (lista: BlocoTexto[], nivel: number): Bloco[] => lista.flatMap((b): Bloco[] => {
    if (b.tipo === 'paragrafo') return [paragrafo(b.trechos)];
    const rotulo = prefixo.length ? [paragrafo([])] : []; // o rótulo fica numa linha própria antes da lista ou tabela
    if (b.tipo === 'tabela') {
      // Como no DOCX: colunas iguais, borda cinza fina, cabeçalho com fundo e negrito, repetido em cada página.
      const n = colunas(b);
      const body = b.linhas.map((linha) => Array.from({ length: n }, (_, k) => linha[k] ?? { cabecalho: false, blocos: [] }).map((c) => {
        const conteudo = blocos(aparar(c.blocos), 0);
        return { stack: conteudo.length ? conteudo : [{ text: ' ' }], ...(c.cabecalho ? { bold: true, fillColor: FAIXA_TABELA } : {}) };
      }));
      return [...rotulo, {
        table: { headerRows: linhasDeCabecalho(b), dontBreakRows: true, widths: Array(n).fill('*'), body },
        layout: {
          hLineWidth: () => 0.5, vLineWidth: () => 0.5, hLineColor: () => BORDA_TABELA, vLineColor: () => BORDA_TABELA,
          paddingLeft: () => 4, paddingRight: () => 4, paddingTop: () => 2, paddingBottom: () => 2,
        },
        margin: [0, 2, 0, 2],
      }];
    }
    const itens = b.itens.map((item) => ({ stack: blocos(item, nivel + 1) }));
    const tipo = (b.ordenada ? NUMERACOES : MARCADORES)[Math.min(nivel, 2)];
    return [...rotulo, { [b.ordenada ? 'ol' : 'ul']: itens, type: tipo, markerColor: TEXTO, margin: [nivel ? 0 : RECUO_LISTA - 12, 0, 0, 0] }];
  });
  const saida = blocos(aparar(lerTexto(valor)), 0);
  return saida.length ? saida : [paragrafo([])];
}

/** Caixa do passo: fundo creme, barra laranja à esquerda, "Passo N:" em destaque. */
function caixaPasso(numero: number, texto: string, largura: number): Bloco {
  const rotulo = { text: `Passo ${numero}:  `, bold: true, color: `#${COR_CAIXA_ROTULO}` };
  return centralizado({
    table: {
      dontBreakRows: true,
      widths: [largura - 17 - 3.5],
      body: [[{ stack: textoRicoPdf(texto, [rotulo]), color: TEXTO, fontSize: 10.5, lineHeight: lh(1.1), fillColor: `#${COR_CAIXA_FUNDO}` }]],
    },
    layout: {
      hLineWidth: () => 0.5, vLineWidth: (i: number) => (i === 0 ? 3 : 0.5),
      hLineColor: () => `#${COR_CAIXA_BORDA}`, vLineColor: (i: number) => (i === 0 ? `#${COR_CAIXA_BARRA}` : `#${COR_CAIXA_BORDA}`),
      paddingLeft: () => 8.5, paddingRight: () => 8.5, paddingTop: () => 5, paddingBottom: () => 5,
    },
  }, largura);
}

/** Centraliza um bloco de largura fixa na página. */
const centralizado = (bloco: Bloco, largura: number): Bloco => ({ columns: [{ width: '*', text: '' }, { width: largura, ...bloco }, { width: '*', text: '' }] });

/** Print do passo com borda fina, centralizado. */
function imagemPasso(chave: string, largura: number, altura: number): Bloco {
  return centralizado({
    table: { widths: [largura], body: [[{ image: chave, width: largura, height: altura }]] },
    layout: { hLineWidth: () => 0.5, vLineWidth: () => 0.5, hLineColor: () => `#${COR_BORDA_IMAGEM}`, vLineColor: () => `#${COR_BORDA_IMAGEM}`, paddingLeft: () => 0, paddingRight: () => 0, paddingTop: () => 0, paddingBottom: () => 0 },
  }, largura + 1);
}

/**
 * @param dados   conteúdo do POP (o mesmo do DOCX)
 * @param imagens bytes PNG por caminho (imagem_caminho dos passos)
 */
export async function gerarPdf(dados: DadosPop, imagens: Map<string, Uint8Array>): Promise<Buffer> {
  const modelo = await preparar();
  const comum = cabecalho(dados);
  const prints: Record<string, string> = {};
  for (const [caminho, bytes] of imagens) prints[caminho] = dataUrl(bytes);

  // Procedimentos, como no DOCX: subtítulo do grupo (10 pt antes, 4 depois); print (6 pt antes) e,
  // logo abaixo, a caixa do passo, seguida de um parágrafo de 10 pt depois. Print e caixa ficam juntos.
  const procedimentos: Bloco[] = [];
  let subtitulo: Bloco | null = null;
  for (const item of sequenciaPassos(dados)) {
    if (item.tipo === 'subtitulo') {
      subtitulo = { text: item.texto, bold: true, color: AZUL, fontSize: 12, lineHeight: lh(ENTRELINHA_PADRAO), margin: [0, 10, 0, 4] };
      continue;
    }
    const { passo, texto, numero } = item;
    const chave = passo.imagem_caminho && prints[passo.imagem_caminho] ? passo.imagem_caminho : null;
    const partes: Bloco[] = subtitulo ? [subtitulo] : [];
    subtitulo = null;
    if (chave) {
      const { largura, altura } = tamanhoImagemPt(passo.imagem_largura ?? 1600, passo.imagem_altura ?? 900);
      partes.push({ ...imagemPasso(chave, largura, altura), margin: [0, 6, 0, texto ? 0 : 10] });
      if (texto) partes.push(caixaPasso(numero, texto, largura));
    } else if (texto) {
      partes.push(caixaPasso(numero, texto, LARGURA_CAIXA));
    }
    // Subtítulo, print e caixa ficam juntos (keepNext no DOCX); o espaço depois da caixa pode ir para a próxima página.
    if (partes.length) procedimentos.push({ stack: partes, unbreakable: true });
    if (texto) procedimentos.push({ ...vazio(12, ENTRELINHA_PADRAO), margin: [0, 0, 0, 10] });
  }

  const definicao = {
    pageSize: 'A4',
    pageMargins: MARGENS,
    info: { title: `POP ${dados.identificacao} ${dados.nome}`.trim(), author: dados.autor || undefined, subject: 'Procedimento Operacional Padrão' },
    defaultStyle: { font: 'Roboto', fontSize: 12, color: TEXTO, lineHeight: lh(1) },
    images: { ...modelo, ...prints },
    content: [
      // Cabeçalho. A faixa fica atrás da logo, a 0,9 pt da margem (no Word ela também passa da borda da página).
      { image: 'faixa', width: 547.05, absolutePosition: { x: MARGENS[0] + 0.9, y: MARGENS[1] + 0.15 } },
      // Logo com a moldura de 4 pt do modelo (contorno da imagem; o Word reserva 4,5 pt em volta). Parágrafo de 82 pt.
      {
        stack: [
          { image: 'logo', width: 123.37, height: 67.33, relativePosition: { x: 4.5, y: 4.5 } },
          { canvas: [{ type: 'rect', x: 4.5, y: 4.5, w: 123.37, h: 67.33, lineWidth: 4, lineColor: '#0D0D0B' }] },
        ],
        margin: [0, 0, 0, 82 - 4.5 - 67.33],
      },
      vazio(16, 1.5),
      { text: [{ text: 'POP', bold: true }, ' - Procedimento Operacional Padrão'], fontSize: 20, color: AZUL, lineHeight: lh(1.5) },
      {
        columns: [
          { width: 37.55, stack: [{ image: 'area', width: 24, margin: [4.55, 3.75, 0, 0] }] },
          { width: '*', text: dados.area || ' ', fontSize: 25, bold: true, color: AZUL, lineHeight: lh(1.15) },
        ],
      },
      // Régua laranja (12 pt antes + marca de 18 pt)
      paragrafoComRegua({ y: 2.4, w: 476.2, h: 4.3, cor: LARANJA }, 12 + alturaLinha(18)),

      // Procedimento
      {
        columns: [
          { width: 27.5, stack: [{ image: 'procedimento', width: 18.6, margin: [-0.1, 0, 0, 0] }] },
          { width: '*', text: 'Procedimento', fontSize: 18, bold: true, color: AZUL },
        ],
      },
      vazio(9),
      {
        table: {
          widths: [larguraCol(3686), larguraCol(2639), larguraCol(3163)],
          body: [[dados.nome, comum.mesAno, `Versão: ${dados.versao}`].map((t) => ({ text: t || ' ', fontSize: 14, color: AZUL, verticalAlignment: 'middle' }))],
        },
        layout: semBordas(),
      },
      vazio(10),
      paragrafoComRegua({ y: 0.25, w: 473.4, h: 1.4, cor: CINZA_REGUA }),
      {
        table: {
          widths: [larguraCol(2410), larguraCol(3915), larguraCol(3163)],
          body: [[
            ['Data Criação:', comum.dataCriacao],
            ['Código Procedimento:', dados.codigo],
            ['Identificação POP:', dados.identificacao],
          ].map(([rotulo, valor]) => ({ stack: [{ text: rotulo, bold: true }, { text: valor || ' ' }], lineHeight: lh(1.15) }))],
        },
        layout: semBordas(),
      },
      vazio(7),
      // Linha de "─" do modelo (79 caracteres de 12 pt em cinza-claro)
      { canvas: [{ type: 'line', x1: 0, y1: 7.7, x2: 474, y2: 7.7, lineWidth: 0.6, lineColor: CINZA_TRACO }], margin: [0, 0, 0, alturaLinha(12) - 7.7] },
      {
        table: {
          widths: [larguraCol(576), larguraCol(2543), larguraCol(6379)],
          heights: [28.1], // altura mínima da linha no modelo (562 twips)
          body: [[
            { image: 'executor', width: 17.6, verticalAlignment: 'middle' },
            // Rótulo de 12 pt; a marca de parágrafo do modelo é de 14 pt e dá a altura da última linha.
            { text: [{ text: 'Executor do Processo:' }, { text: ' ', fontSize: 14 }], color: AZUL, verticalAlignment: 'middle' },
            { text: dados.executor || ' ', verticalAlignment: 'middle' },
          ]],
        },
        layout: semBordas(),
      },
      paragrafoComRegua({ x: -0.1, y: 4.87, w: 473.4, h: 1.4, cor: CINZA_REGUA }),

      // Objetivo (linha de 70,85 pt no mínimo, texto centralizado na vertical)
      secao('Objetivo do Processo', { nome: 'objetivo', tamanho: 17, y: 0 }, { x: 427.1, y: -1.2 }),
      vazio(9),
      {
        table: { widths: [larguraCol(9468)], heights: [70.85], body: [[{ stack: textoRicoPdf(dados.objetivo), verticalAlignment: 'middle' }]] },
        layout: semBordas(),
      },
      vazio(12),

      // Envolvidos (Table Grid Light, listas "1." e "A." com os recuos do modelo)
      secao('Envolvidos', { nome: 'envolvidos', tamanho: 17, y: 0.05 }, { x: 422.6, y: -1.6 }),
      vazio(12),
      {
        table: {
          widths: [larguraCol(2830, 2.85), larguraCol(6663, 2.85)],
          body: comum.envolvidos.map((e, i) => [itemLista(`${i + 1}.`, e.area, 18), itemLista(`${String.fromCharCode(65 + (i % 26))}.`, e.cargo, 54)]),
        },
        layout: {
          hLineWidth: () => 0.5, vLineWidth: () => 0.5, hLineColor: () => BORDA_TABELA, vLineColor: () => BORDA_TABELA,
          paddingLeft: () => 2.85, paddingRight: () => MARGEM_CELULA, paddingTop: () => 2.85, paddingBottom: () => 2.85,
        },
      },
      vazio(12),

      // Recursos (Plain Table 2: linhas em cima e embaixo; linha de 27,35 pt no mínimo)
      secao('Recursos do Processo', { nome: 'recursos', tamanho: 18.3, y: 0.05 }, { x: 425.5, y: -1.26 }),
      vazio(12),
      {
        table: {
          widths: [larguraCol(2410), larguraCol(4536), larguraCol(2542)],
          heights: [27.35],
          body: [[
            { text: 'Fluxograma', alignment: 'center', verticalAlignment: 'middle' },
            { text: DESCRICAO_FLUXOGRAMA, alignment: 'center', verticalAlignment: 'middle' },
            dados.link_fluxograma
              ? { text: 'Abrir diagrama', link: dados.link_fluxograma, color: LINK, decoration: 'underline', alignment: 'center', verticalAlignment: 'middle' }
              : { text: '—', alignment: 'center', verticalAlignment: 'middle' },
          ]],
        },
        layout: { ...semBordas(), hLineWidth: () => 0.5, hLineColor: () => BORDA_RECURSOS },
      },
      vazio(12),
      vazio(12),

      // Procedimentos
      secao('Procedimentos', { nome: 'procedimentos', tamanho: 17, y: 0.13 }, { x: 425.5, y: -2.02 }),
      vazio(18),
      ...procedimentos,
      vazio(18),

      // Histórico de revisões (régua, título e tabela juntos na mesma página)
      {
        unbreakable: true,
        stack: [
          paragrafoComRegua({ x: (LARGURA - 476.2) / 2, y: 6.86, w: 476.2, h: 4.3, cor: LARANJA }),
          vazio(12),
          { text: 'Históricos de Revisões', fontSize: 18, bold: true },
          vazio(12),
          {
            table: {
              headerRows: 1,
              widths: [larguraCol(2929), larguraCol(3382), larguraCol(3177)],
              body: [
                ['Data', 'Elaborado por', 'Revisão'].map((t) => ({ text: t, bold: true, alignment: 'center' })),
                ...comum.historico.map((h) => [h.data, h.elaboradoPor, h.revisao].map((t) => ({ text: t || ' ', alignment: 'center' }))),
              ],
            },
            layout: {
              hLineWidth: () => 0.5, vLineWidth: () => 0.5, hLineColor: () => BORDA_TABELA, vLineColor: () => BORDA_TABELA,
              paddingLeft: () => MARGEM_CELULA, paddingRight: () => MARGEM_CELULA, paddingTop: () => 1.4, paddingBottom: () => 1.4,
              // Plain Table 1: linhas de dados alternadas com fundo cinza-claro, a começar pela primeira.
              fillColor: (linha: number) => (linha > 0 && linha % 2 === 1 ? FAIXA_TABELA : null),
            },
          },
        ],
      },
    ],
  };

  return pdfmake.createPdf(definicao).getBuffer();
}
