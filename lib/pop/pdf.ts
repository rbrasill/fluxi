// Gera o POP em PDF no desenho do documento (decisão 140), o mesmo da página pública: cabeçalho com a logo sobre o
// padrão, seções com faixa em degradê, ficha do procedimento, faixa escura a cada etapa, passos em cartões numerados
// (o print em cima, o texto embaixo) ligados por uma linha, histórico de revisões e rodapé em todas as páginas.
// Usa o pdfmake (JavaScript puro, roda na Vercel). As fontes, a logo e o padrão vêm de templates/pop/.
//
// O pdfmake só conhece a altura de um bloco depois de montá-lo. Por isso:
//  - o que tem altura fixa (faixa da seção, selo do número, pílula) é desenhado com retângulos arredondados;
//  - a faixa da etapa cresce com o nome: é uma tabela com o fundo escuro e uma "tampa" arredondada em cima e embaixo;
//  - o cartão do passo é uma tabela, e os cantos arredondados são desenhados por cima, um a um (`canto`).
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import pdfmake from 'pdfmake';
import { DESCRICAO_FLUXOGRAMA, arquivosGerais, cabecalho, etapasDoDocumento, tamanhoImagemPt, type ArquivoDoDocumento, type DadosPop, type PassoDoDocumento } from './documento';
import { colunas, lerTextoParaDocumento, linhasDeCabecalho, textoPuro, type Bloco as BlocoTexto, type Trecho } from './texto-rico';

const PASTA = () => path.join(process.cwd(), 'templates/pop');

// Cores do documento, as mesmas da página (`.docpop` em app/globals.css).
const TINTA = '#0f2742';
const TINTA_2 = '#4a5a70';
const LINHA = '#d9dee8';
const SUPERFICIE = '#f6f8fd';
const REGUA = '#ff3c00'; // régua do título e rótulo "Etapa N"
const SELO = '#fd4308'; // número do passo
const ETAPA = '#3f4a64'; // faixa da etapa
const CREME = '#fff4e0'; // caixa do texto do passo
const BARRA = '#ff6400'; // barra à esquerda do texto do passo
const TEXTO_PASSO = '#2b3d55';
const NOTA = '#fff3e0';
const LARANJA = '#f57c00';
const BRANCO = '#ffffff';
const DEGRADE = ['#bcd3f5', '#cfe0f8', '#eadfe6', '#f9c8a0', '#ffa86a'];
const FUNDO_CABECALHO = '#eef1f6'; // cabeçalho de tabela dentro de um texto

// Página A4 (595,28 × 841,89 pt). A margem de baixo guarda o rodapé.
const MARGENS: [number, number, number, number] = [50, 44, 50, 54];
const LARGURA = 595.28 - MARGENS[0] - MARGENS[2];
const ALTURA_UTIL = 841.89 - MARGENS[1] - MARGENS[3];

const ALTURA_TOPO = 66; // cabeçalho com a logo
const LARGURA_LOGO = (ALTURA_TOPO * 380) / 208; // proporção da logo
const ALTURA_FAIXA = 25; // faixa do título da seção
const RAIO_ETAPA = 8;
const ALTURA_ROTULO = 27; // caixa branca "Etapa N"
const DIAMETRO = 22; // selo do número do passo
const CALHA = 32; // coluna do selo e da linha que liga os passos
const TRACO = 1.2; // linha que liga os passos
const LARGURA_CARTAO = LARGURA - CALHA;
const BORDA = 0.75; // borda do cartão
const RAIO = 6; // cantos do cartão
const LARGURA_BARRA = 7;
const ALTURA_MAX_PRINT = 330;
const ESPACO_PASSOS = 14;
const ALTURA_DA_LINHA = 1.1719; // altura natural da linha da Roboto, em múltiplos do tamanho da fonte
const TEXTO_DO_PASSO = { fontSize: 10, lineHeight: 1.3 };
const TEXTO_DO_OBJETIVO = { fontSize: 11, lineHeight: 1.3 };
const MARGEM_DO_TEXTO: [number, number, number, number] = [10, 8, 10, 9];
// O pdfmake perde o que passa do fim da página num bloco que não se separa. Por isso só fica inteiro o que cabe com
// folga, pela altura estimada (sempre para mais): um passo, mesmo junto da faixa da seção e da faixa da etapa
// (que cresce com o nome), e uma seção com a faixa dela. Acima disso, o conteúdo continua na página seguinte.
const LIMITE_INTEIRO = ALTURA_UTIL - 260;
const LIMITE_DA_SECAO = ALTURA_UTIL - 140;
const CARACTERES_POR_LINHA = 70; // estimativa conservadora para o texto do passo

// Tipos mínimos do documento do pdfmake usados aqui.
type Bloco = Record<string, unknown>;
type Tabela = { table: { widths: unknown[] } };
type Margem = [number, number, number, number];

// --- Ícones (os mesmos da página), em SVG ---

const svgTraco = (corpo: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="${TINTA}" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${corpo}</svg>`;
const svgRedondo = (corpo: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 44 44" width="44" height="44"><circle cx="22" cy="22" r="22" fill="${NOTA}"/><g transform="translate(9 9) scale(1.0833)" fill="none" stroke="${LARANJA}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${corpo}</g></svg>`;
const ICONES = {
  procedimento: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/>',
  objetivo: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4.5"/>',
  envolvidos: '<circle cx="8" cy="8" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M2.5 20c0-3.3 2.5-6 5.5-6s5.5 2.7 5.5 6M15 14.5c3 0 6.5 1.5 6.5 5.5"/>',
  recursos: '<rect x="4" y="3" width="16" height="7" rx="1"/><rect x="4" y="14" width="16" height="7" rx="1"/><path d="M12 10v4"/>',
  procedimentos: '<path d="M9 11V5.5a1.5 1.5 0 0 1 3 0V11m0-1.5a1.5 1.5 0 0 1 3 0V11m0-.5a1.5 1.5 0 0 1 3 0V15a6 6 0 0 1-6 6h-1a6 6 0 0 1-5-2.7L4 14.5a1.6 1.6 0 0 1 2.6-1.8L9 15"/>',
  historico: '<path d="M3 12a9 9 0 1 0 9-9 9 9 0 0 0-6.4 2.6L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/>',
};
const ICONE_AREA = svgRedondo('<path d="M3 21h18"/><rect x="5" y="3" width="10" height="18" rx="1.2"/><path d="M15 9h3a1 1 0 0 1 1 1v11"/><path d="M8.5 7h3M8.5 11h3M8.5 15h3"/>');
const ICONE_EXECUTOR = svgRedondo('<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8"/>');

/** Imagem para o pdfmake. O tipo é lido dos primeiros bytes: os prints podem ser PNG ou JPEG. */
const dataUrl = (bytes: Buffer | Uint8Array) => `data:image/${bytes[0] === 0xff && bytes[1] === 0xd8 ? 'jpeg' : 'png'};base64,${Buffer.from(bytes).toString('base64')}`;

let pronto: Promise<Record<string, string>> | null = null;
/** Registra as fontes e carrega a logo e o padrão do cabeçalho uma vez por processo. */
function preparar() {
  pronto ??= (async () => {
    const fontes = path.join(PASTA(), 'fontes');
    const arquivos = ['Roboto-Regular.ttf', 'Roboto-Bold.ttf', 'Roboto-Italic.ttf', 'Roboto-BoldItalic.ttf'];
    await Promise.all(arquivos.map(async (a) => pdfmake.virtualfs.writeFileSync(a, await readFile(path.join(fontes, a)))));
    pdfmake.addFonts({ Roboto: { normal: arquivos[0], bold: arquivos[1], italics: arquivos[2], bolditalics: arquivos[3] } });
    // Nada vem de fora: nem arquivos locais por caminho, nem URLs.
    pdfmake.setLocalAccessPolicy(() => false);
    pdfmake.setUrlAccessPolicy(() => false);
    const pares = await Promise.all(['logo.png', 'padrao.jpg'].map(async (a) => [a.split('.')[0], dataUrl(await readFile(path.join(PASTA(), 'imagens', a)))] as const));
    return Object.fromEntries(pares);
  })();
  return pronto;
}

// --- Peças do desenho ---

const semBordas = (p: { esquerda?: number; direita?: number; cima?: number; baixo?: number } = {}) => ({
  hLineWidth: () => 0, vLineWidth: () => 0,
  paddingLeft: () => p.esquerda ?? 0, paddingRight: () => p.direita ?? 0, paddingTop: () => p.cima ?? 0, paddingBottom: () => p.baixo ?? 0,
});

/** Tabela com a borda de fora e uma linha entre as linhas, sem linhas entre as colunas. */
const grade = (horizontal: number, vertical: number) => ({
  hLineWidth: () => 0.6, hLineColor: () => LINHA,
  vLineWidth: (i: number, no: Tabela) => (i === 0 || i === no.table.widths.length ? 0.6 : 0), vLineColor: () => LINHA,
  paddingLeft: () => horizontal, paddingRight: () => horizontal, paddingTop: () => vertical, paddingBottom: () => vertical,
});

const linha = (espessura: number): Bloco => ({ canvas: [{ type: 'rect', x: 0, y: 0, w: LARGURA, h: espessura, color: LINHA }] });

/** Blocos que não se separam entre páginas. */
const juntos = (blocos: Bloco[]): Bloco => ({ stack: blocos, unbreakable: true });

/** Faixa do título da seção: degradê do azul ao laranja, com o ícone. */
function faixa(titulo: string, icone: keyof typeof ICONES): Bloco {
  const tamanho = 12.5;
  const respiro = (ALTURA_FAIXA - tamanho * ALTURA_DA_LINHA) / 2;
  return {
    margin: [0, 22, 0, 11],
    stack: [
      { canvas: [{ type: 'rect', x: 0, y: 0, w: LARGURA, h: ALTURA_FAIXA, r: 5, linearGradient: DEGRADE }], relativePosition: { x: 0, y: 0 } },
      {
        columns: [{ svg: svgTraco(ICONES[icone]), width: 12, margin: [0, 1.3, 0, 0] }, { width: '*', text: titulo, fontSize: tamanho, bold: true, color: TINTA, lineHeight: 1 }],
        columnGap: 6.5, margin: [9, respiro, 9, respiro],
      },
    ],
  };
}

/** Uma seção: a faixa e o conteúdo. `inteira` mantém tudo na mesma página (a faixa nunca fica sozinha no fim de uma). */
const secao = (titulo: string, icone: keyof typeof ICONES, corpo: Bloco[], inteira = true): Bloco[] =>
  (inteira ? [juntos([faixa(titulo, icone), ...corpo])] : [faixa(titulo, icone), ...corpo]);

/** Campo da ficha: rótulo em negrito e o valor embaixo. */
const campo = (rotulo: string, valor: string): Bloco => ({
  stack: [{ text: rotulo, bold: true, fontSize: 8.8, color: TINTA }, { text: valor || '—', fontSize: 10, color: TINTA_2, margin: [0, 1.5, 0, 0] }],
});

/** Um link numa pílula cinza ("Abrir diagrama", "Abrir"); sem link, um traço. */
function pilula(texto: string, link: string | null | undefined, largura: number): Bloco {
  const altura = 17, tamanho = 8.5;
  const respiro = (altura - tamanho * ALTURA_DA_LINHA) / 2;
  return {
    stack: [
      { canvas: [{ type: 'rect', x: 0.3, y: 0.3, w: largura - 0.6, h: altura - 0.6, r: (altura - 0.6) / 2, color: '#eceff3', lineColor: '#dde1e8', lineWidth: 0.6 }], relativePosition: { x: 0, y: 0 } },
      { text: link ? texto : '—', ...(link ? { link } : {}), fontSize: tamanho, lineHeight: 1, color: TINTA_2, alignment: 'center', margin: [0, respiro, 0, respiro] },
    ],
  };
}

const LARGURA_ABRIR = 52;
const dataBr = (dia: string) => dia.slice(0, 10).split('-').reverse().join('/');
/**
 * Os arquivos anexados (decisão 141), numa tabela: a descrição, o nome do arquivo e até quando vale; "Abrir" leva
 * ao arquivo na página pública do POP, quando ela está no ar.
 */
function tabelaDeArquivos(arquivos: ArquivoDoDocumento[]): Bloco {
  return {
    table: {
      widths: ['*', LARGURA_ABRIR], dontBreakRows: true,
      body: arquivos.map((a) => [
        { stack: [{ text: a.descricao || a.nome, color: TINTA }, { text: `${a.nome}${a.validade ? ` · válido até ${dataBr(a.validade)}` : ''}`, fontSize: 8, color: TINTA_2, margin: [0, 1, 0, 0] }] },
        a.link ? { ...pilula('Abrir', a.link, LARGURA_ABRIR), margin: [0, 3, 0, 0] } : { text: '' },
      ]),
    },
    layout: grade(10, 6),
  };
}
/** Altura aproximada da tabela de arquivos (cada linha tem a descrição e, embaixo, o nome). */
const alturaDosArquivos = (arquivos: ArquivoDoDocumento[]) => arquivos.reduce((t, a) => t + (Math.ceil((a.descricao || a.nome).length / 70) + Math.ceil((a.nome.length + 24) / 85)) * 13 + 14, 0);

/** Faixa escura da etapa: "Etapa N" numa caixa branca e o nome ao lado. Cresce com o nome. */
function faixaEtapa(ordem: number, nome: string): Bloco {
  const larguraRotulo = 64 + 7 * String(ordem).length;
  const tamanho = 12.5;
  const respiro = (ALTURA_ROTULO - tamanho * ALTURA_DA_LINHA) / 2;
  const tampa = (margem?: Margem): Bloco => ({ canvas: [{ type: 'rect', x: 0, y: 0, w: LARGURA, h: 2 * RAIO_ETAPA, r: RAIO_ETAPA, color: ETAPA }], ...(margem ? { margin: margem } : {}) });
  return {
    stack: [
      tampa(),
      {
        margin: [0, -RAIO_ETAPA, 0, 0],
        table: {
          widths: [larguraRotulo, '*'],
          body: [[
            {
              verticalAlignment: 'middle',
              stack: [
                { canvas: [{ type: 'rect', x: 0, y: 0, w: larguraRotulo, h: ALTURA_ROTULO, r: 5, color: BRANCO }], relativePosition: { x: 0, y: 0 } },
                { text: `Etapa ${ordem}`, bold: true, fontSize: tamanho, lineHeight: 1, color: REGUA, alignment: 'center', margin: [0, respiro, 0, respiro] },
              ],
            },
            { text: nome || ' ', fontSize: 14, color: BRANCO, verticalAlignment: 'middle' },
          ]],
        },
        // A tampa de baixo é desenhada por cima do fim da tabela: o espaço de baixo tem de ser pelo menos o raio.
        layout: {
          hLineWidth: () => 0, vLineWidth: () => 0, fillColor: () => ETAPA,
          paddingLeft: (i: number) => (i === 0 ? 18 : 16), paddingRight: (i: number) => (i === 1 ? 18 : 0), paddingTop: () => RAIO_ETAPA, paddingBottom: () => RAIO_ETAPA,
        },
      },
      tampa([0, -RAIO_ETAPA, 0, 0]),
    ],
  };
}

/** Selo redondo com o número do passo, com um anel branco em volta (a linha que liga os passos não encosta nele). */
function selo(numero: number): Bloco {
  const tamanho = numero > 99 ? 8.5 : 10.5;
  const respiro = (DIAMETRO - tamanho * ALTURA_DA_LINHA) / 2;
  const raio = DIAMETRO / 2;
  return {
    stack: [
      {
        canvas: [
          { type: 'ellipse', x: raio, y: raio, r1: raio + 3, r2: raio + 3, color: BRANCO },
          { type: 'ellipse', x: raio, y: raio, r1: raio, r2: raio, color: SELO },
        ],
        relativePosition: { x: 0, y: 0 },
      },
      { columns: [{ width: DIAMETRO, text: String(numero), alignment: 'center', bold: true, fontSize: tamanho, lineHeight: 1, color: BRANCO }], margin: [0, respiro, 0, respiro] },
    ],
  };
}

/**
 * Um canto arredondado do cartão, desenhado por cima dele: um pedaço branco esconde a ponta quadrada e um arco
 * refaz a borda. `qual`: s/i = superior/inferior, e/d = esquerdo/direito. `em` é a posição do quadrado do canto
 * (RAIO × RAIO) em relação ao ponto onde o bloco entra.
 */
function canto(qual: 'se' | 'sd' | 'ie' | 'id', em: { x: number; y: number }): Bloco {
  const esquerdo = qual[1] === 'e', superior = qual[0] === 's';
  const centro = { x: esquerdo ? RAIO : 0, y: superior ? RAIO : 0 };
  const sx = esquerdo ? -1 : 1, sy = superior ? -1 : 1; // do centro do arco para a ponta do cartão
  const arco = (raio: number) => Array.from({ length: 9 }, (_, i) => {
    const t = (Math.PI / 2) * (i / 8);
    return { x: centro.x + sx * raio * Math.sin(t), y: centro.y + sy * raio * Math.cos(t) };
  });
  const fora = RAIO + 0.6; // o branco passa um pouco da ponta, para não sobrar um fio da borda
  return {
    relativePosition: em,
    canvas: [
      { type: 'polyline', closePath: true, color: BRANCO, points: [{ x: centro.x, y: centro.y + sy * fora }, { x: centro.x + sx * fora, y: centro.y + sy * fora }, { x: centro.x + sx * fora, y: centro.y }, ...arco(RAIO).reverse()] },
      { type: 'polyline', lineColor: LINHA, lineWidth: BORDA, points: arco(RAIO - BORDA / 2) },
    ],
  };
}

type Print = { chave: string; largura: number; altura: number };

/**
 * Cartão do passo: o print em cima (na largura do cartão; o que é mais alto fica menor e centralizado) e o texto
 * embaixo, na caixa creme com a barra laranja. As bordas não são linhas da tabela, porque o pdfmake desenha as
 * linhas depois do conteúdo e elas passariam por cima dos cantos arredondados: as dos lados são colunas finas
 * pintadas, e as de cima e de baixo, retângulos à parte.
 *
 * Devolve o cartão em duas partes que se encaixam: `topo` (a borda de cima e o print, ou o cartão inteiro quando só
 * há uma das duas coisas) e `resto` (o texto e a borda de baixo, quando há print e texto). Juntas formam o cartão;
 * separadas, deixam o texto longo continuar na página seguinte sem levar o print junto.
 */
function cartao(passo: PassoDoDocumento, print: Print | null, referencias: DadosPop['referencias']): { topo: Bloco[]; resto: Bloco[] } {
  const lado = (): Bloco => ({ text: '', fillColor: LINHA });
  const borda = (): Bloco => ({ canvas: [{ type: 'rect', x: 0, y: 0, w: LARGURA_CARTAO, h: BORDA, color: LINHA }] });
  const tabela = (linha: Bloco[]): Bloco => ({ table: { widths: [BORDA, LARGURA_BARRA, LARGURA_CARTAO - 2 * BORDA - LARGURA_BARRA, BORDA], body: [linha] }, layout: semBordas() });
  const cantosDeCima = (x: number, y: number) => [canto('se', { x, y }), canto('sd', { x: x + LARGURA_CARTAO - RAIO, y })];
  const cantosDeBaixo = () => [canto('ie', { x: 0, y: -RAIO }), canto('id', { x: LARGURA_CARTAO - RAIO, y: -RAIO })];
  const imagem = print && tabela([lado(), {
    colSpan: 2, fillColor: SUPERFICIE,
    stack: [{ image: print.chave, width: print.largura, height: print.altura, alignment: 'center' }, ...cantosDeCima(-BORDA, -print.altura - BORDA)],
  }, {}, lado()]);
  const texto = passo.texto && tabela([lado(), { text: '', fillColor: BARRA }, {
    fillColor: CREME,
    stack: [
      ...(print ? [] : cantosDeCima(-BORDA - LARGURA_BARRA, -BORDA)),
      { stack: textoRicoPdf(passo.texto, referencias), ...TEXTO_DO_PASSO, color: TEXTO_PASSO, margin: MARGEM_DO_TEXTO },
    ],
  }, lado()]);
  if (imagem && texto) return { topo: [borda(), imagem], resto: [texto, borda(), ...cantosDeBaixo()] };
  return { topo: [borda(), ...(imagem ? [imagem] : []), ...(texto ? [texto] : []), borda(), ...cantosDeBaixo()], resto: [] };
}

/** Altura aproximada do texto de um passo, em linhas. */
function linhasDoTexto(blocos: BlocoTexto[], porLinha = CARACTERES_POR_LINHA): number {
  return blocos.reduce((n, b) => {
    if (b.tipo === 'paragrafo') return n + Math.max(1, Math.ceil(b.trechos.reduce((t, x) => t + x.texto.length, 0) / porLinha));
    if (b.tipo === 'tabela') {
      const cada = Math.max(8, Math.floor(porLinha / colunas(b)) - 2);
      return n + b.linhas.reduce((t, l) => t + Math.max(1, ...l.map((c) => linhasDoTexto(c.blocos, cada))) + 0.5, 0);
    }
    return n + b.itens.reduce((t, item) => t + linhasDoTexto(item, porLinha - 4), 0);
  }, 0);
}

/** Altura aproximada de uma tabela de texto simples: `porLinha` são os caracteres que cabem em cada coluna. */
const alturaDaTabela = (linhas: string[][], porLinha: number[], respiro: number) =>
  linhas.reduce((t, l) => t + Math.max(1, ...l.map((c, i) => Math.ceil(c.length / porLinha[i]))) * 10 * ALTURA_DA_LINHA * 1.15 + 2 * respiro + 0.6, 0);

/**
 * Um passo: o selo com o número à esquerda e o cartão à direita. Quando há um passo depois dele na mesma etapa,
 * uma linha desce do selo até o próximo.
 *
 * Devolve `junto` (não se separa entre páginas) e `depois` (pode continuar na página seguinte). O passo que cabe
 * numa página sai inteiro em `junto`. O de texto longo sai partido: o selo e o print em `junto`, o texto em `depois`.
 */
function passoPdf(passo: PassoDoDocumento, print: Print | null, temProximo: boolean, referencias: DadosPop['referencias']): { junto: Bloco | null; depois: Bloco | null } {
  const alturaDoTexto = passo.texto
    ? linhasDoTexto(lerTextoParaDocumento(passo.texto, referencias)) * TEXTO_DO_PASSO.fontSize * ALTURA_DA_LINHA * TEXTO_DO_PASSO.lineHeight + MARGEM_DO_TEXTO[1] + MARGEM_DO_TEXTO[3]
    : 0;
  const { topo, resto } = cartao(passo, print, referencias);
  if ((print?.altura ?? 0) + alturaDoTexto > LIMITE_INTEIRO) {
    // Texto longo: sem a linha que liga os passos, que não acompanha a quebra de página.
    const lado = (esquerda: Bloco, direita: Bloco[], baixo: number): Bloco => ({ table: { widths: [CALHA, LARGURA_CARTAO], body: [[esquerda, { stack: direita }]] }, layout: semBordas({ baixo }) });
    return resto.length
      ? { junto: lado(selo(passo.numero), topo, 0), depois: lado({ text: '' }, resto, ESPACO_PASSOS) }
      : { junto: null, depois: lado(selo(passo.numero), topo, ESPACO_PASSOS) };
  }
  // Duas linhas: a do selo e a do resto da altura do cartão (que ocupa as duas). A linha que liga os passos é a
  // borda direita da primeira célula da segunda linha, e passa pelo espaço até o próximo passo.
  return {
    depois: null,
    junto: {
      table: {
        widths: [DIAMETRO / 2 - TRACO / 2, CALHA - DIAMETRO / 2 - TRACO / 2, LARGURA_CARTAO],
        body: [
          [{ ...selo(passo.numero), colSpan: 2 }, {}, { stack: [...topo, ...resto], rowSpan: 2 }],
          [{ text: '', border: [false, false, temProximo, false] }, { text: '' }, {}],
        ],
      },
      layout: {
        defaultBorder: false, hLineWidth: () => 0, vLineWidth: (i: number) => (i === 1 ? TRACO : 0), vLineColor: () => LINHA,
        paddingLeft: () => 0, paddingRight: () => 0, paddingTop: () => 0, paddingBottom: (i: number) => (i === 1 ? ESPACO_PASSOS : 3),
      },
    },
  };
}

// --- Texto com formatação (texto-rico.ts): mesmas marcas, listas e recuos do editor ---

const RECUO_LISTA = 18; // pt por nível
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
    ...(t.link ? { link: t.link } : {}),
  };
});

function aparar(blocos: BlocoTexto[]) {
  const vazio = (b: BlocoTexto) => b.tipo === 'paragrafo' && !b.trechos.some((t) => t.texto.trim());
  let i = 0, f = blocos.length;
  while (i < f && vazio(blocos[i])) i++;
  while (f > i && vazio(blocos[f - 1])) f--;
  return blocos.slice(i, f);
}

/** Blocos do pdfmake para um texto com formatação. */
function textoRicoPdf(valor: string, referencias?: DadosPop['referencias']): Bloco[] {
  const paragrafo = (trechos: Trecho[]): Bloco => {
    const runs = trechosPdf(trechos);
    return { text: runs.length ? runs : ' ' };
  };
  const blocos = (lista: BlocoTexto[], nivel: number): Bloco[] => lista.flatMap((b): Bloco[] => {
    if (b.tipo === 'paragrafo') return [paragrafo(b.trechos)];
    if (b.tipo === 'tabela') {
      // Colunas iguais, borda cinza fina, cabeçalho com fundo e negrito, repetido em cada página.
      const n = colunas(b);
      const body = b.linhas.map((l) => Array.from({ length: n }, (_, k) => l[k] ?? { cabecalho: false, blocos: [] }).map((c) => {
        const conteudo = blocos(aparar(c.blocos), 0);
        return { stack: conteudo.length ? conteudo : [{ text: ' ' }], ...(c.cabecalho ? { bold: true, fillColor: FUNDO_CABECALHO } : {}) };
      }));
      return [{
        table: { headerRows: linhasDeCabecalho(b), dontBreakRows: true, widths: Array(n).fill('*'), body },
        layout: {
          hLineWidth: () => 0.5, vLineWidth: () => 0.5, hLineColor: () => '#c5ccd8', vLineColor: () => '#c5ccd8',
          paddingLeft: () => 4, paddingRight: () => 4, paddingTop: () => 2, paddingBottom: () => 2,
        },
        margin: [0, 2, 0, 2],
      }];
    }
    const itens = b.itens.map((item) => ({ stack: blocos(item, nivel + 1) }));
    const tipo = (b.ordenada ? NUMERACOES : MARCADORES)[Math.min(nivel, 2)];
    return [{ [b.ordenada ? 'ol' : 'ul']: itens, type: tipo, margin: [nivel ? 0 : RECUO_LISTA - 12, 0, 0, 0] }];
  });
  const saida = blocos(aparar(lerTextoParaDocumento(valor, referencias)), 0);
  return saida.length ? saida : [paragrafo([])];
}

/**
 * @param dados   conteúdo do POP
 * @param imagens bytes dos prints (PNG ou JPEG) por caminho (imagem_caminho dos passos)
 */
export async function gerarPdf(dados: DadosPop, imagens: Map<string, Uint8Array>): Promise<Buffer> {
  const modelo = await preparar();
  const comum = cabecalho(dados);
  const prints: Record<string, string> = {};
  for (const [caminho, bytes] of imagens) prints[caminho] = dataUrl(bytes);

  // Procedimentos: a faixa da etapa fica na mesma página do primeiro passo dela, e a faixa da seção, na da primeira etapa.
  // A etapa com arquivos (decisão 141) mostra a lista deles logo abaixo da faixa; os passos vêm depois, cada um inteiro.
  const arquivos = new Map((dados.arquivos ?? []).map((a) => [a.id, a]));
  const etapas = etapasDoDocumento(dados.procedimentos, (caminho) => caminho in prints, (id) => arquivos.has(id));
  const gerais = arquivosGerais(dados.arquivos ?? [], etapas);
  const procedimentos: Bloco[] = [];
  etapas.forEach((etapa, e) => {
    const abertura: Bloco[] = [
      ...(e === 0 ? [faixa('Procedimentos', 'procedimentos')] : []),
      { ...faixaEtapa(etapa.ordem, etapa.nome), margin: [0, e === 0 ? 0 : 12, 0, 13] },
    ];
    if (etapa.arquivos.length) {
      const daEtapa = etapa.arquivos.map((id) => arquivos.get(id)!);
      const tabela = { ...tabelaDeArquivos(daEtapa), margin: [0, 0, 0, 13] };
      if (alturaDosArquivos(daEtapa) <= LIMITE_INTEIRO) procedimentos.push(juntos([...abertura, tabela]));
      else procedimentos.push(juntos(abertura), tabela);
      abertura.length = 0; // a faixa já saiu, com a lista de arquivos
    }
    etapa.passos.forEach((passo, i) => {
      const print = passo.imagem
        ? { chave: passo.imagem, ...tamanhoImagemPt(passo.passo.imagem_largura ?? 1600, passo.passo.imagem_altura ?? 900, LARGURA_CARTAO - 2 * BORDA, ALTURA_MAX_PRINT) }
        : null;
      const { junto, depois } = passoPdf(passo, print, i < etapa.passos.length - 1, dados.referencias);
      const antes = i === 0 ? abertura : [];
      if (junto || antes.length) procedimentos.push(juntos([...antes, ...(junto ? [junto] : [])]));
      if (depois) procedimentos.push(depois);
    });
  });
  if (!etapas.length) procedimentos.push(...secao('Procedimentos', 'procedimentos', [{ text: 'Este POP ainda não tem passos.', color: TINTA_2 }]));

  const larguraPilula = 80;
  const alturaDoObjetivo = linhasDoTexto(lerTextoParaDocumento(dados.objetivo, dados.referencias), 76) * TEXTO_DO_OBJETIVO.fontSize * ALTURA_DA_LINHA * TEXTO_DO_OBJETIVO.lineHeight;
  const rodape = `POP ${dados.identificacao ? `${dados.identificacao} · ` : ''}Código ${dados.codigo}`;
  const definicao = {
    pageSize: 'A4',
    pageMargins: MARGENS,
    info: { title: `POP ${dados.identificacao} ${dados.nome}`.trim(), author: dados.autor || undefined, subject: 'Procedimento Operacional Padrão' },
    defaultStyle: { font: 'Roboto', fontSize: 10, color: TINTA, lineHeight: 1.15 },
    images: { ...modelo, ...prints },
    footer: (pagina: number, total: number): Bloco => ({
      margin: [MARGENS[0], 16, MARGENS[2], 0],
      stack: [
        linha(0.6),
        {
          columns: [
            { width: '*', text: rodape },
            { width: 'auto', text: `${dados.organizacao ? `${dados.organizacao} · ` : ''}Página ${pagina} de ${total}`, alignment: 'right' },
          ],
          columnGap: 12, fontSize: 8, color: TINTA_2, margin: [0, 7, 0, 0],
        },
      ],
    }),
    content: [
      // Cabeçalho: o padrão em toda a largura e a logo, num bloco preto, à esquerda.
      {
        margin: [0, 0, 0, 26],
        stack: [
          { image: 'padrao', cover: { width: LARGURA, height: ALTURA_TOPO, align: 'center', valign: 'center' }, opacity: 0.6, relativePosition: { x: 0, y: 0 } },
          { canvas: [{ type: 'rect', x: 0, y: 0, w: LARGURA_LOGO, h: ALTURA_TOPO, color: '#0c0c0b' }], relativePosition: { x: 0, y: 0 } },
          { image: 'logo', width: LARGURA_LOGO, height: ALTURA_TOPO },
        ],
      },
      { text: [{ text: 'POP', bold: true }, ' - Procedimento Operacional Padrão'], fontSize: 13, color: TINTA },
      {
        columns: [{ svg: ICONE_AREA, width: 30 }, { width: '*', text: dados.area || dados.nome || ' ', fontSize: 26, bold: true, color: TINTA, lineHeight: 1 }],
        columnGap: 9, margin: [0, 5, 0, 0],
      },
      { canvas: [{ type: 'rect', x: 0, y: 0, w: LARGURA, h: 3.6, r: 0.6, color: REGUA }], margin: [0, 14, 0, 0] },

      ...secao('Procedimento', 'procedimento', [
        {
          table: {
            widths: ['*', 'auto', 'auto'],
            body: [[
              { text: dados.nome || ' ', fontSize: 12.5, color: TINTA },
              { text: comum.mesAno, color: TINTA_2, noWrap: true, margin: [14, 2.8, 0, 0] },
              { text: `Versão: ${dados.versao || '—'}`, color: TINTA_2, noWrap: true, margin: [14, 2.8, 0, 0] },
            ]],
          },
          layout: semBordas({ baixo: 8 }),
        },
        linha(1.2),
        {
          table: { widths: ['*', '*', '*'], body: [[campo('Data de criação', comum.dataCriacao), campo('Código do procedimento', dados.codigo), campo('Identificação do POP', dados.identificacao)]] },
          layout: semBordas({ cima: 9, baixo: 9, direita: 10 }),
        },
        linha(0.6),
        {
          columns: [
            { svg: ICONE_EXECUTOR, width: 26 },
            { width: '*', stack: [{ text: 'Executor do processo', fontSize: 8, color: TINTA_2 }, { text: dados.executor || '—', fontSize: 11, color: TINTA }], margin: [0, 1.5, 0, 0] },
          ],
          columnGap: 9, margin: [0, 8, 0, 8],
        },
        linha(1.2),
      ]),

      ...(textoPuro(dados.objetivo)
        ? secao('Objetivo do processo', 'objetivo', [{ stack: textoRicoPdf(dados.objetivo, dados.referencias), ...TEXTO_DO_OBJETIVO, color: TINTA }], alturaDoObjetivo <= LIMITE_DA_SECAO)
        : []),

      ...(comum.envolvidos.length
        ? secao('Envolvidos', 'envolvidos', [{
          table: { widths: [LARGURA * 0.3, '*'], dontBreakRows: true, body: comum.envolvidos.map((e) => [{ text: e.area || '—', color: TINTA_2 }, { text: e.cargo || '—', color: TINTA }]) },
          layout: grade(11, 7.5),
        }], alturaDaTabela(comum.envolvidos.map((e) => [e.area, e.cargo]), [22, 46], 7.5) <= LIMITE_DA_SECAO)
        : []),

      ...secao('Recursos do processo', 'recursos', [{
        table: {
          widths: [LARGURA * 0.22, '*', larguraPilula],
          body: [[
            { text: 'Fluxograma', color: TINTA, margin: [0, 2.7, 0, 0] },
            { text: DESCRICAO_FLUXOGRAMA, color: TINTA_2, margin: [0, 2.7, 0, 0] },
            pilula('Abrir diagrama', dados.link_fluxograma, larguraPilula),
          ]],
        },
        layout: { ...semBordas({ esquerda: 11, direita: 11, cima: 8, baixo: 8 }), hLineWidth: () => 0.6, hLineColor: () => LINHA },
      }, ...(gerais.length && alturaDosArquivos(gerais) <= LIMITE_DA_SECAO - 60 ? [{ ...tabelaDeArquivos(gerais), margin: [0, 12, 0, 0] }] : [])]),
      // Muitos arquivos gerais: a lista continua na página seguinte, fora do bloco da seção.
      ...(gerais.length && alturaDosArquivos(gerais) > LIMITE_DA_SECAO - 60 ? [{ ...tabelaDeArquivos(gerais), margin: [0, 12, 0, 0] }] : []),

      ...procedimentos,

      ...(comum.historico.length
        ? secao('Histórico de revisões', 'historico', [{
          table: {
            headerRows: 1, keepWithHeaderRows: 1, dontBreakRows: true,
            // A coluna "Revisão" é a mais larga: leva a versão e o que mudou (decisão 138).
            widths: [58, 112, '*'],
            body: [
              ['Data', 'Elaborado por', 'Revisão'].map((t) => ({ text: t, bold: true, fontSize: 8.8, color: TINTA, fillColor: SUPERFICIE })),
              ...comum.historico.map((h) => [h.data, h.elaboradoPor, h.revisao].map((t, i) => ({ text: t || ' ', color: i === 2 ? TINTA : TINTA_2 }))),
            ],
          },
          layout: grade(10, 7),
        }], alturaDaTabela([['Data', '', ''], ...comum.historico.map((h) => [h.data, h.elaboradoPor, h.revisao])], [12, 17, 40], 7) <= LIMITE_DA_SECAO)
        : []),
    ],
  };

  return pdfmake.createPdf(definicao).getBuffer();
}
