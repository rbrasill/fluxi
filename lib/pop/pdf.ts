// Gera o POP em PDF com o mesmo conteúdo e o visual do Modelo POP v3, sem depender do Word.
// Usa o pdfmake (JavaScript puro, roda na Vercel). Fontes e imagens do modelo vêm de templates/pop/.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import pdfmake from 'pdfmake';
import {
  COR_AZUL, COR_BORDA_IMAGEM, COR_CAIXA_BARRA, COR_CAIXA_BORDA, COR_CAIXA_FUNDO, COR_CAIXA_ROTULO, COR_TEXTO,
  DESCRICAO_FLUXOGRAMA, cabecalho, sequenciaPassos, tamanhoImagemPt, type DadosPop,
} from './docx';

const PASTA = () => path.join(process.cwd(), 'templates/pop');
const AZUL = `#${COR_AZUL}`;
const TEXTO = `#${COR_TEXTO}`;
const LARANJA = '#FF7D01';
const FUNDO_SECAO = '#E2EAFC';
const LINHA = '#D9D9D9';
const LINK = '#005F73';

// Página A4 com as margens do modelo (em pontos). Largura útil: 9488 twips = 474,4 pt.
const MARGENS: [number, number, number, number] = [56.7, 56.7, 63.7, 40];
const LARGURA = 474.4;
const LARGURA_CAIXA = 472.45; // caixa de passo sem print (9449 twips)
const tw = (twips: number) => twips / 20; // twips → pontos
// Largura de coluna: no pdfmake o padding das células soma à largura, então ele é descontado aqui.
const col = (twips: number, padding = 8) => tw(twips) - padding;
const dataUrl = (png: Buffer | Uint8Array) => `data:image/png;base64,${Buffer.from(png).toString('base64')}`;

// Tipos mínimos do documento do pdfmake usados aqui.
type Bloco = Record<string, unknown>;

let pronto: Promise<Record<string, string>> | null = null;
/** Registra as fontes e carrega as imagens do modelo uma vez por processo. */
function preparar() {
  pronto ??= (async () => {
    const fontes = path.join(PASTA(), 'fontes');
    const arquivos = ['Roboto-Regular.ttf', 'Roboto-Medium.ttf', 'Roboto-Italic.ttf', 'Roboto-MediumItalic.ttf'];
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

const semBordas = 'noBorders';
const bordasClaras = {
  hLineWidth: () => 0.5, vLineWidth: () => 0.5, hLineColor: () => LINHA, vLineColor: () => LINHA,
  paddingLeft: () => 5, paddingRight: () => 5, paddingTop: () => 3, paddingBottom: () => 3,
};

/** Barra de título de seção: fundo azul-claro, ícone à esquerda e a decoração à direita. */
function secao(titulo: string, icone: string): Bloco {
  return {
    table: {
      widths: [24, '*', 44],
      body: [[
        { image: icone, width: 17, margin: [4, 4, 0, 3] },
        { text: titulo, fontSize: 16, bold: true, color: AZUL, margin: [2, 4, 0, 3] },
        { image: 'decoracao', width: 39.5, alignment: 'right', margin: [0, 1, 2, 1] },
      ]],
    },
    layout: { ...bordasClaras, hLineWidth: () => 0, vLineWidth: () => 0, paddingLeft: () => 0, paddingRight: () => 0, paddingTop: () => 0, paddingBottom: () => 0, fillColor: () => FUNDO_SECAO },
    margin: [0, 10, 0, 8],
  };
}

const linhaFina = (largura = LARGURA, cor = LINHA): Bloco => ({ canvas: [{ type: 'line', x1: 0, y1: 0, x2: largura, y2: 0, lineWidth: 0.75, lineColor: cor }], margin: [0, 4, 0, 6] });
const reguaLaranja = (): Bloco => ({ canvas: [{ type: 'rect', x: 0, y: 0, w: 476, h: 4.25, color: LARANJA }], margin: [0, 0, 0, 8] });

/** Centraliza um bloco de largura fixa na página. */
const centralizado = (bloco: Bloco, largura: number): Bloco => ({ columns: [{ width: '*', text: '' }, { width: largura, ...bloco }, { width: '*', text: '' }] });

/** Caixa do passo: fundo creme, barra laranja à esquerda, "Passo N:" em destaque. */
function caixaPasso(numero: number, texto: string, largura: number): Bloco {
  return centralizado({
    table: {
      widths: [largura - 17 - 3.5],
      body: [[{ text: [{ text: `Passo ${numero}:  `, bold: true, color: `#${COR_CAIXA_ROTULO}` }, { text: texto, color: TEXTO }], fontSize: 10.5, lineHeight: 1.15, fillColor: `#${COR_CAIXA_FUNDO}` }]],
    },
    layout: {
      hLineWidth: () => 0.5, vLineWidth: (i: number) => (i === 0 ? 3 : 0.5),
      hLineColor: () => `#${COR_CAIXA_BORDA}`, vLineColor: (i: number) => (i === 0 ? `#${COR_CAIXA_BARRA}` : `#${COR_CAIXA_BORDA}`),
      paddingLeft: () => 8.5, paddingRight: () => 8.5, paddingTop: () => 5, paddingBottom: () => 5,
    },
  }, largura);
}

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

  // Procedimentos: subtítulo do grupo; print e caixa do passo (juntos na mesma página).
  const procedimentos: Bloco[] = [];
  let subtitulo: Bloco | null = null;
  for (const item of sequenciaPassos(dados)) {
    if (item.tipo === 'subtitulo') {
      subtitulo = { text: item.texto, bold: true, color: AZUL, fontSize: 12, margin: [0, 4, 0, 6] };
      continue;
    }
    const { passo, texto, numero } = item;
    const chave = passo.imagem_caminho && prints[passo.imagem_caminho] ? passo.imagem_caminho : null;
    const partes: Bloco[] = subtitulo ? [subtitulo] : [];
    subtitulo = null;
    if (chave) {
      const { largura, altura } = tamanhoImagemPt(passo.imagem_largura ?? 1600, passo.imagem_altura ?? 900);
      partes.push(imagemPasso(chave, largura, altura));
      if (texto) partes.push(caixaPasso(numero, texto, largura + 1));
    } else if (texto) {
      partes.push(caixaPasso(numero, texto, LARGURA_CAIXA));
    }
    if (partes.length) procedimentos.push({ stack: partes, unbreakable: true, margin: [0, 6, 0, 10] });
  }
  if (!procedimentos.length) procedimentos.push({ text: '—', color: TEXTO, margin: [4, 6, 0, 10] });

  const definicao = {
    pageSize: 'A4',
    pageMargins: MARGENS,
    info: { title: `POP ${dados.identificacao} ${dados.nome}`.trim(), author: dados.autor || undefined, subject: 'Procedimento Operacional Padrão' },
    defaultStyle: { font: 'Roboto', fontSize: 12, color: TEXTO },
    images: { ...modelo, ...prints },
    content: [
      // Cabeçalho: faixa decorativa atrás da logo (como no modelo) e a logo
      { image: 'faixa', width: 538, absolutePosition: { x: MARGENS[0] + 0.9, y: MARGENS[1] } },
      { image: 'logo', width: 123.4 },
      { text: [{ text: 'POP', bold: true }, ' - Procedimento Operacional Padrão'], fontSize: 20, color: AZUL, margin: [0, 12, 0, 0], lineHeight: 1.2 },
      { columns: [{ image: 'area', width: 24, margin: [0, 4, 0, 0] }, { text: dados.area || ' ', fontSize: 25, bold: true, color: AZUL, margin: [6, 0, 0, 0] }], margin: [0, 2, 0, 6] },
      reguaLaranja(),

      // Procedimento
      { columns: [{ image: 'procedimento', width: 18.6, margin: [0, 2, 0, 0] }, { text: 'Procedimento', fontSize: 18, bold: true, color: AZUL, margin: [8, 0, 0, 0] }], margin: [0, 2, 0, 8] },
      {
        table: { widths: [col(3686), col(2639), col(3163)], body: [[
          { text: dados.nome, fontSize: 14, color: AZUL }, { text: comum.mesAno, fontSize: 14, color: AZUL }, { text: `Versão: ${dados.versao}`, fontSize: 14, color: AZUL },
        ]] },
        layout: semBordas, margin: [0, 0, 0, 4],
      },
      linhaFina(473),
      {
        table: { widths: [col(2410), col(3915), col(3163)], body: [[
          { stack: [{ text: 'Data Criação:', bold: true }, { text: comum.dataCriacao }] },
          { stack: [{ text: 'Código Procedimento:', bold: true }, { text: dados.codigo }] },
          { stack: [{ text: 'Identificação POP:', bold: true }, { text: dados.identificacao || '—' }] },
        ]] },
        layout: semBordas, margin: [0, 2, 0, 4],
      },
      linhaFina(440, '#BFBFBF'),
      {
        table: { widths: [col(576), col(2743), col(6179)], body: [[
          { image: 'executor', width: 17.6, margin: [4, 5, 0, 5] },
          { text: 'Executor do Processo:', color: AZUL, margin: [0, 7, 0, 7] },
          { text: dados.executor || '—', bold: true, margin: [0, 7, 0, 7] },
        ]] },
        layout: semBordas, margin: [0, 2, 0, 0],
      },
      linhaFina(473),

      // Objetivo
      secao('Objetivo do Processo', 'objetivo'),
      { text: dados.objetivo || '—', margin: [4, 8, 4, 10], lineHeight: 1.15 },

      // Envolvidos
      secao('Envolvidos', 'envolvidos'),
      {
        table: {
          widths: [col(2830, 10), col(6663, 11.5)],
          body: comum.envolvidos.map((e, i) => [{ text: `${i + 1}. ${e.area}` }, { text: `${String.fromCharCode(65 + (i % 26))}. ${e.cargo}` }]),
        },
        layout: bordasClaras, margin: [0, 0, 0, 4],
      },

      // Recursos
      secao('Recursos do Processo', 'recursos'),
      {
        table: { widths: [col(2410), col(4536), col(2542)], body: [[
          { text: 'Fluxograma', alignment: 'center', margin: [0, 7, 0, 7] },
          { text: DESCRICAO_FLUXOGRAMA, alignment: 'center', margin: [0, 7, 0, 7] },
          dados.link_fluxograma
            ? { text: 'Abrir diagrama', link: dados.link_fluxograma, color: LINK, decoration: 'underline', alignment: 'center', margin: [0, 7, 0, 7] }
            : { text: '—', alignment: 'center', margin: [0, 7, 0, 7] },
        ]] },
        layout: { hLineWidth: () => 0.75, vLineWidth: () => 0, hLineColor: () => '#7F7F7F', paddingTop: () => 0, paddingBottom: () => 0 },
        margin: [0, 0, 0, 4],
      },

      // Procedimentos
      secao('Procedimentos', 'procedimentos'),
      ...procedimentos,

      // Histórico de revisões (régua, título e tabela juntos na mesma página)
      { unbreakable: true, margin: [0, 10, 0, 0], stack: [
      { ...reguaLaranja(), margin: [0, 0, 0, 8] },
      { text: 'Históricos de Revisões', fontSize: 18, bold: true, margin: [0, 0, 0, 8] },
      {
        table: {
          headerRows: 1,
          widths: [col(2929, 10), col(3382, 10), col(3177, 12)],
          body: [
            [{ text: 'Data', bold: true, alignment: 'center' }, { text: 'Elaborado por', bold: true, alignment: 'center' }, { text: 'Revisão', bold: true, alignment: 'center' }],
            ...comum.historico.map((h) => [{ text: h.data, alignment: 'center' }, { text: h.elaboradoPor || '—', alignment: 'center' }, { text: h.revisao, alignment: 'center' }]),
          ],
        },
        layout: bordasClaras,
      },
      ] },
    ],
  };

  return pdfmake.createPdf(definicao).getBuffer();
}
