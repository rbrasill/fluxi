// As regras de negócio do processo em PDF (decisão 107). Mesmo motor do POP (pdfmake, roda na Vercel), com a
// identidade do documento do POP: o logo da INC, títulos em azul-marinho e o laranja da marca nos detalhes.
// O corpo traz só as regras, por tipo e na ordem do código; quem falou, quem confirmou e de onde veio fica num
// resumo de observações e histórico, no fim.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import pdfmake from 'pdfmake';
import { TIPOS_REGRA, type TipoRegra } from '@/lib/entrevista/topicos';
import type { DocumentoDasRegras } from '@/lib/server/regras';

const AZUL = '#0E2841';
const TEXTO = '#182737';
const SUAVE = '#5A6372';
const LINHA = '#E3E7EE';
const LARANJA = '#FF7D01';
const COR_DO_TIPO: Record<TipoRegra, { forte: string; fundo: string }> = {
  negocio: { forte: AZUL, fundo: '#E2EAFC' },
  comportamento: { forte: '#B45309', fundo: '#FFF4E0' },
  definicao: { forte: '#3F4A5A', fundo: '#EEF1F5' },
};
const TITULO_DO_TIPO: Record<TipoRegra, string> = { negocio: 'Regras de negócio', comportamento: 'Regras de comportamento', definicao: 'Definições' };

const MARGEM = 54;
const LARGURA = 595.28 - 2 * MARGEM; // A4

type Bloco = Record<string, unknown>;

let pronto: Promise<{ logo: string }> | null = null;
function preparar() {
  pronto ??= (async () => {
    const pasta = path.join(process.cwd(), 'templates/pop');
    const arquivos = ['Roboto-Regular.ttf', 'Roboto-Bold.ttf', 'Roboto-Italic.ttf', 'Roboto-BoldItalic.ttf'];
    await Promise.all(arquivos.map(async (a) => pdfmake.virtualfs.writeFileSync(a, await readFile(path.join(pasta, 'fontes', a)))));
    pdfmake.addFonts({ Roboto: { normal: arquivos[0], bold: arquivos[1], italics: arquivos[2], bolditalics: arquivos[3] } });
    pdfmake.setLocalAccessPolicy(() => false);
    pdfmake.setUrlAccessPolicy(() => false);
    const logo = await readFile(path.join(pasta, 'imagens', 'logo.png'));
    return { logo: `data:image/png;base64,${logo.toString('base64')}` };
  })();
  return pronto;
}

const dataBR = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Sao_Paulo' });
const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

/** O selo com o código da regra (RN-01), na cor do tipo. */
function codigo(c: string, tipo: TipoRegra): Bloco {
  const cor = COR_DO_TIPO[tipo];
  return {
    table: { widths: [44], body: [[{ text: c, bold: true, fontSize: 9, color: cor.forte, alignment: 'center', characterSpacing: 0.4 }]] },
    layout: { hLineWidth: () => 0, vLineWidth: () => 0, fillColor: () => cor.fundo, paddingTop: () => 3, paddingBottom: () => 3, paddingLeft: () => 0, paddingRight: () => 0 },
  };
}

/** Uma seção por tipo: o título com a sigla, o que o tipo quer dizer e as regras em linhas. */
function secaoDoTipo(tipo: TipoRegra, regras: DocumentoDasRegras['regras']): Bloco[] {
  const info = TIPOS_REGRA.find((t) => t.id === tipo)!;
  const cor = COR_DO_TIPO[tipo];
  const linhas = regras.map((r, i) => [
    { stack: [codigo(r.codigo, tipo)], margin: [0, 1, 0, 0] },
    {
      stack: [
        { text: r.texto, fontSize: 10.5, lineHeight: 1.3, color: TEXTO },
        ...(r.aplica ? [{ text: [{ text: 'Aplica-se a: ', bold: true }, r.aplica], fontSize: 8.5, color: SUAVE, margin: [0, 3, 0, 0] }] : []),
      ],
    },
  ].map((c) => ({ ...c, border: [false, i > 0, false, false] })));
  return [
    {
      unbreakable: true,
      stack: [
        {
          columns: [
            { width: 4, canvas: [{ type: 'rect', x: 0, y: 1, w: 4, h: 18, color: cor.forte }] },
            { width: '*', text: [{ text: TITULO_DO_TIPO[tipo], bold: true }, { text: `  ·  ${info.sigla}`, color: SUAVE, bold: false }], fontSize: 14, color: AZUL, margin: [8, 1, 0, 0] },
            { width: 'auto', text: plural(regras.length, 'regra', 'regras'), fontSize: 9, color: SUAVE, margin: [0, 5, 0, 0] },
          ],
        },
        { text: info.o_que, fontSize: 9.5, color: SUAVE, margin: [12, 4, 0, 10] },
        // A primeira regra vai junto com o título (o título nunca fica sozinho no pé da página).
        regras.length ? tabela(linhas.slice(0, 1)) : { text: '' },
      ],
    },
    ...(linhas.length > 1 ? [tabela(linhas.slice(1), true)] : []),
    { text: '', margin: [0, 0, 0, 18] },
  ];
}

function tabela(linhas: Bloco[][], continua = false): Bloco {
  return {
    table: { widths: [52, '*'], dontBreakRows: true, body: linhas.map((l, i) => (continua && i === 0 ? l.map((c) => ({ ...c, border: [false, true, false, false] })) : l)) },
    layout: {
      hLineWidth: () => 0.6, vLineWidth: () => 0, hLineColor: () => LINHA,
      paddingLeft: (i: number) => (i === 0 ? 0 : 10), paddingRight: () => 0, paddingTop: () => 9, paddingBottom: () => 9,
    },
  };
}

/** O resumo das três quantidades por tipo, logo abaixo do título. */
function resumo(d: DocumentoDasRegras): Bloco {
  const caixa = (tipo: TipoRegra) => {
    const n = d.regras.filter((r) => r.tipo === tipo).length;
    const cor = COR_DO_TIPO[tipo];
    return {
      table: {
        widths: ['*'],
        body: [[{
          stack: [
            { text: String(n), fontSize: 20, bold: true, color: cor.forte },
            { text: n === 1 ? TIPOS_REGRA.find((t) => t.id === tipo)!.rotulo : TITULO_DO_TIPO[tipo], fontSize: 9, color: SUAVE, margin: [0, 1, 0, 0] },
          ],
        }]],
      },
      layout: { hLineWidth: () => 0, vLineWidth: () => 0, fillColor: () => cor.fundo, paddingLeft: () => 12, paddingRight: () => 12, paddingTop: () => 9, paddingBottom: () => 9 },
    };
  };
  return { columns: (['negocio', 'comportamento', 'definicao'] as TipoRegra[]).map(caixa), columnGap: 10, margin: [0, 0, 0, 24] };
}

/** Observações e histórico: de onde as regras vieram e quem confirmou, em poucas linhas. */
function historico(d: DocumentoDasRegras): Bloco {
  const h = d.historico;
  const itens: (string | Bloco)[] = [];
  if (h.confirmador) itens.push({ text: [{ text: 'Responsável pela confirmação: ', bold: true }, h.confirmador] });
  const origem = [h.maia && `${plural(h.maia, 'regra identificada', 'regras identificadas')} pela Maia em entrevistas`, h.manuais && `${plural(h.manuais, 'regra escrita', 'regras escritas')} pela equipe`].filter(Boolean).join(' e ');
  if (origem) itens.push({ text: [{ text: 'Origem: ', bold: true }, `${origem}.`] });
  if (h.entrevistas.length) itens.push({ text: [{ text: 'Entrevistas consideradas: ', bold: true }, h.entrevistas.map((e) => `${e.entrevistado ?? 'pessoa entrevistada'} (${dataBR(e.quando)})`).join('; '), '.'] });
  if (h.confirmacoes.length) itens.push({ text: [{ text: 'Confirmadas por: ', bold: true }, h.confirmacoes.map((c) => `${c.nome} (${c.total})`).join('; '), h.ultima_confirmacao ? `. Última confirmação em ${dataBR(h.ultima_confirmacao)}.` : '.'] });
  if (h.pendentes) itens.push({ text: [{ text: 'Em revisão: ', bold: true }, `${plural(h.pendentes, 'regra sugerida aguarda', 'regras sugeridas aguardam')} confirmação e não ${h.pendentes === 1 ? 'faz' : 'fazem'} parte deste documento.`] });
  return {
    unbreakable: true,
    margin: [0, 10, 0, 0],
    stack: [
      { canvas: [{ type: 'line', x1: 0, y1: 0, x2: LARGURA, y2: 0, lineWidth: 0.6, lineColor: LINHA }], margin: [0, 0, 0, 12] },
      { text: 'Observações e histórico', fontSize: 11, bold: true, color: AZUL, margin: [0, 0, 0, 6] },
      { ul: itens, fontSize: 8.5, color: SUAVE, lineHeight: 1.3, markerColor: LARANJA },
    ],
  };
}

export async function gerarPdfDasRegras(d: DocumentoDasRegras): Promise<Buffer> {
  const { logo } = await preparar();
  const onde = [d.organizacao, d.area].filter(Boolean).join(' · ');
  const tipos = (['negocio', 'comportamento', 'definicao'] as TipoRegra[]).filter((t) => d.regras.some((r) => r.tipo === t));
  const definicao = {
    pageSize: 'A4',
    pageMargins: [MARGEM, MARGEM, MARGEM, 56],
    info: { title: `Regras de negócio · ${d.processo}`, author: d.organizacao ?? 'INC', creator: 'INCFlow' },
    defaultStyle: { font: 'Roboto', fontSize: 10, color: TEXTO },
    footer: (pagina: number, total: number) => ({
      margin: [MARGEM, 18, MARGEM, 0],
      columns: [
        { text: `Regras de negócio · ${d.processo}`, fontSize: 8, color: SUAVE },
        { text: `Página ${pagina} de ${total}`, fontSize: 8, color: SUAVE, alignment: 'right', width: 'auto' },
      ],
    }),
    content: [
      // Cabeçalho: logo, o rótulo do documento e o processo.
      {
        columns: [
          { image: logo, width: 76 },
          {
            width: '*', margin: [16, 4, 0, 0],
            stack: [
              { text: 'REGRAS DE NEGÓCIO', fontSize: 8.5, bold: true, color: LARANJA, characterSpacing: 1.4 },
              { text: d.processo, fontSize: 22, bold: true, color: AZUL, margin: [0, 3, 0, 0], lineHeight: 1.05 },
              ...(onde ? [{ text: onde, fontSize: 10, color: SUAVE, margin: [0, 4, 0, 0] }] : []),
            ],
          },
        ],
      },
      { canvas: [{ type: 'rect', x: 0, y: 0, w: 40, h: 3, color: LARANJA }, { type: 'line', x1: 40, y1: 1.5, x2: LARGURA, y2: 1.5, lineWidth: 0.6, lineColor: LINHA }], margin: [0, 16, 0, 10] },
      {
        text: `${plural(d.regras.length, 'regra confirmada', 'regras confirmadas')} · emitido em ${dataBR(d.emitido_em)}`,
        fontSize: 9, color: SUAVE, margin: [0, 0, 0, 18],
      },
      resumo(d),
      ...tipos.flatMap((t) => secaoDoTipo(t, d.regras.filter((r) => r.tipo === t))),
      historico(d),
    ],
  };
  return pdfmake.createPdf(definicao).getBuffer();
}
