// Preenche o Modelo POP v3 (templates/pop/modelo-pop-v3.template.docx).
// Independente do Next/Supabase: recebe os dados e as imagens já carregadas.
import Docxtemplater from 'docxtemplater';
import PizZip from 'pizzip';
import type { ConteudoPop, Historico, Passo } from './schema';
import { lerTexto, textoPuro, type Bloco, type Trecho } from './texto-rico';

export type DadosPop = ConteudoPop & {
  nome: string;
  codigo: string;
  identificacao: string;
  versao: string;
  autor: string; // "Elaborado por": quem criou o POP
  criado_em: string; // ISO
  link_fluxograma?: string | null;
  historico: Historico[];
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
const LARGURA_CAIXA_TWIPS = 9449; // caixa de passo sem print: largura do modelo
const EMU_POR_TWIP = 635;
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Formatação comum aos dois formatos (DOCX e PDF). */
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

function paragrafoImagem(rId: string, idNum: number, cx: number, cy: number, nome: string, comCaixa: boolean) {
  // keepNext: o print não fica numa página e o texto dele na outra.
  return `<w:p><w:pPr>${comCaixa ? '<w:keepNext/>' : ''}<w:spacing w:before="120" w:after="${comCaixa ? 0 : 200}"/><w:jc w:val="center"/></w:pPr><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${idNum}" name="${esc(nome)}"/><wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="${idNum}" name="${esc(nome)}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${rId}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:ln w="6350"><a:solidFill><a:srgbClr val="${COR_BORDA_IMAGEM}"/></a:solidFill></a:ln></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`;
}

// --- Texto com formatação (negrito, cor, marca-texto, listas…) em parágrafos do Word ---

const ABS_MARCADORES = 9001; // listas do texto com formatação: definições próprias no numbering.xml
const ABS_NUMEROS = 9002;
const RECUO_LISTA = 360; // twips por nível (0,25")

function nivelXml(nivel: number, formato: string, texto: string) {
  const esquerda = RECUO_LISTA * (nivel + 1);
  return `<w:lvl w:ilvl="${nivel}"><w:start w:val="1"/><w:numFmt w:val="${formato}"/><w:lvlText w:val="${texto}"/><w:lvlJc w:val="left"/>`
    + `<w:pPr><w:ind w:left="${esquerda}" w:hanging="${RECUO_LISTA}"/></w:pPr></w:lvl>`;
}
const DEFINICOES_LISTAS = `<w:abstractNum w:abstractNumId="${ABS_MARCADORES}"><w:multiLevelType w:val="hybridMultilevel"/>`
  + ['•', '◦', '▪'].map((m, i) => nivelXml(i, 'bullet', m)).join('') + '</w:abstractNum>'
  + `<w:abstractNum w:abstractNumId="${ABS_NUMEROS}"><w:multiLevelType w:val="hybridMultilevel"/>`
  + [['decimal', '%1.'], ['lowerLetter', '%2.'], ['lowerRoman', '%3.']].map(([f, t], i) => nivelXml(i, f, t)).join('') + '</w:abstractNum>';

/** Listas do documento: cada lista numerada recomeça em 1 (uma numeração própria); marcadores compartilham uma. */
class Numeracao {
  private nums: string[] = [];
  private proximo = 9001;
  private marcadores?: number;
  lista(ordenada: boolean) {
    if (!ordenada) return (this.marcadores ??= this.nova(ABS_MARCADORES, false));
    return this.nova(ABS_NUMEROS, true);
  }
  private nova(abs: number, reiniciar: boolean) {
    const id = this.proximo++;
    const inicio = reiniciar ? [0, 1, 2].map((n) => `<w:lvlOverride w:ilvl="${n}"><w:startOverride w:val="1"/></w:lvlOverride>`).join('') : '';
    this.nums.push(`<w:num w:numId="${id}"><w:abstractNumId w:val="${abs}"/>${inicio}</w:num>`);
    return id;
  }
  /** Acrescenta as definições ao numbering.xml do modelo (abstractNum antes de todos os num). */
  aplicar(xml: string) {
    if (!this.nums.length) return xml;
    const i = xml.indexOf('<w:num ');
    const comDefinicoes = i >= 0 ? xml.slice(0, i) + DEFINICOES_LISTAS + xml.slice(i) : xml.replace('</w:numbering>', `${DEFINICOES_LISTAS}</w:numbering>`);
    return comDefinicoes.replace('</w:numbering>', `${this.nums.join('')}</w:numbering>`);
  }
}

type Base = { cor: string; tamanho?: number; semNegrito?: boolean };

/** Runs de um parágrafo; a ordem dos elementos de w:rPr segue o esquema do Word. */
function runsXml(trechos: Trecho[], base: Base) {
  return trechos.map((t) => {
    const sz = base.tamanho ? `<w:sz w:val="${base.tamanho}"/><w:szCs w:val="${base.tamanho}"/>` : '';
    const rPr = (t.negrito ? '<w:b/><w:bCs/>' : base.semNegrito ? '<w:b w:val="0"/><w:bCs w:val="0"/>' : '')
      + (t.italico ? '<w:i/><w:iCs/>' : '')
      + (t.tachado ? '<w:strike/>' : '')
      + `<w:color w:val="${(t.cor ?? `#${base.cor}`).slice(1)}"/>`
      + sz
      + (t.sublinhado ? '<w:u w:val="single"/>' : '')
      + (t.fundo ? `<w:shd w:val="clear" w:color="auto" w:fill="${t.fundo.slice(1)}"/>` : '');
    const conteudo = t.texto.split('\n').map((l) => `<w:t xml:space="preserve">${esc(l)}</w:t>`).join('<w:br/>');
    return `<w:r><w:rPr>${rPr}</w:rPr>${conteudo}</w:r>`;
  }).join('');
}

/** Tira parágrafos vazios do começo e do fim (o editor deixa um parágrafo vazio ao apagar). */
function aparar(blocos: Bloco[]) {
  const vazio = (b: Bloco) => b.tipo === 'paragrafo' && !b.trechos.some((t) => t.texto.trim());
  let i = 0, f = blocos.length;
  while (i < f && vazio(blocos[i])) i++;
  while (f > i && vazio(blocos[f - 1])) f--;
  return blocos.slice(i, f);
}

/**
 * Parágrafos do Word para o texto com formatação.
 * @param pPr       propriedades comuns dos parágrafos (estilo e espaçamento), na ordem do esquema
 * @param inicio    runs no começo do primeiro parágrafo (ex.: o rótulo "Passo 3:")
 */
function paragrafosXml(valor: string, o: { base: Base; numeracao: Numeracao; estilo?: string; espacamento?: string; inicio?: string }) {
  const estilo = o.estilo ? `<w:pStyle w:val="${o.estilo}"/>` : '';
  const espacamento = o.espacamento ?? '';
  const saida: string[] = [];
  let inicio = o.inicio ?? '';
  // Marca de parágrafo com a cor e o tamanho do texto: o número ou marcador da lista usa esse formato.
  const sz = o.base.tamanho ? `<w:sz w:val="${o.base.tamanho}"/><w:szCs w:val="${o.base.tamanho}"/>` : '';
  const marca = `<w:rPr><w:color w:val="${o.base.cor}"/>${sz}</w:rPr>`;
  const paragrafo = (trechos: Trecho[], extra: { numPr?: string; ind?: string } = {}) => {
    saida.push(`<w:p><w:pPr>${estilo}${extra.numPr ?? ''}${espacamento}${extra.ind ?? ''}${marca}</w:pPr>${inicio}${runsXml(trechos, o.base)}</w:p>`);
    inicio = '';
  };
  const percorrer = (blocos: Bloco[], nivel: number) => {
    for (const b of blocos) {
      if (b.tipo === 'paragrafo') {
        paragrafo(b.trechos, nivel ? { ind: `<w:ind w:left="${RECUO_LISTA * nivel}"/>` } : {});
        continue;
      }
      if (inicio) paragrafo([]); // o rótulo fica numa linha própria antes da lista
      const id = o.numeracao.lista(b.ordenada);
      for (const item of b.itens) {
        const [primeiro, ...resto] = item;
        if (primeiro?.tipo === 'paragrafo') {
          paragrafo(primeiro.trechos, { numPr: `<w:numPr><w:ilvl w:val="${Math.min(nivel, 2)}"/><w:numId w:val="${id}"/></w:numPr>` });
          percorrer(resto, nivel + 1);
        } else {
          percorrer(item, nivel + 1);
        }
      }
    }
  };
  percorrer(aparar(lerTexto(valor)), 0);
  if (!saida.length) paragrafo([]); // célula de tabela precisa de um parágrafo
  return saida.join('');
}

/** Texto do passo numa tabela de uma célula (fundo creme, barra laranja), centralizada. */
function caixaTexto(rotulo: string, texto: string, larguraTwips: number, numeracao: Numeracao) {
  const borda = (lado: string, cor: string, sz: number) => `<w:${lado} w:val="single" w:sz="${sz}" w:space="0" w:color="${cor}"/>`;
  const rotuloXml = `<w:r><w:rPr><w:b/><w:color w:val="${COR_CAIXA_ROTULO}"/><w:sz w:val="21"/><w:szCs w:val="21"/></w:rPr><w:t xml:space="preserve">${esc(rotulo)}  </w:t></w:r>`;
  const paragrafos = paragrafosXml(texto, {
    base: { cor: COR_TEXTO, tamanho: 21 }, numeracao, inicio: rotuloXml,
    espacamento: '<w:spacing w:before="0" w:after="0" w:line="264" w:lineRule="auto"/>',
  });
  return `<w:tbl><w:tblPr><w:tblW w:w="${larguraTwips}" w:type="dxa"/><w:jc w:val="center"/>`
    + `<w:tblBorders>${borda('top', COR_CAIXA_BORDA, 4)}${borda('left', COR_CAIXA_BARRA, 24)}${borda('bottom', COR_CAIXA_BORDA, 4)}${borda('right', COR_CAIXA_BORDA, 4)}</w:tblBorders>`
    + `<w:tblLayout w:type="fixed"/><w:tblCellMar><w:top w:w="100" w:type="dxa"/><w:left w:w="170" w:type="dxa"/><w:bottom w:w="100" w:type="dxa"/><w:right w:w="170" w:type="dxa"/></w:tblCellMar>`
    + `<w:tblLook w:val="0000"/></w:tblPr><w:tblGrid><w:gridCol w:w="${larguraTwips}"/></w:tblGrid>`
    + `<w:tr><w:trPr><w:cantSplit/></w:trPr><w:tc><w:tcPr><w:tcW w:w="${larguraTwips}" w:type="dxa"/><w:shd w:val="clear" w:color="auto" w:fill="${COR_CAIXA_FUNDO}"/></w:tcPr>`
    + `${paragrafos}</w:tc></w:tr></w:tbl>`
    // espaço depois da caixa (e evita que duas tabelas seguidas se juntem)
    + '<w:p><w:pPr><w:spacing w:before="0" w:after="200"/></w:pPr></w:p>';
}

function paragrafoSubtitulo(texto: string) {
  return `<w:p><w:pPr><w:keepNext/><w:spacing w:before="200" w:after="80"/></w:pPr><w:r><w:rPr><w:b/><w:color w:val="${COR_AZUL}"/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr><w:t xml:space="preserve">${esc(texto)}</w:t></w:r></w:p>`;
}

function paragrafoLink(rId: string | null) {
  if (!rId) return '<w:p><w:pPr><w:pStyle w:val="NoSpacing"/><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:color w:val="182737"/></w:rPr><w:t>—</w:t></w:r></w:p>';
  return `<w:p><w:pPr><w:pStyle w:val="NoSpacing"/><w:jc w:val="center"/></w:pPr><w:hyperlink r:id="${rId}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:r><w:rPr><w:color w:val="005F73"/><w:u w:val="single"/></w:rPr><w:t>Abrir diagrama</w:t></w:r></w:hyperlink></w:p>`;
}

/**
 * @param modelo  bytes do template
 * @param imagens bytes PNG por caminho (imagem_caminho dos passos)
 */
export function gerarDocx(modelo: Buffer | Uint8Array, dados: DadosPop, imagens: Map<string, Uint8Array>): Buffer {
  const zip = new PizZip(modelo);

  // Registra as imagens no pacote (media + relacionamentos) antes de renderizar.
  const relsPath = 'word/_rels/document.xml.rels';
  let rels = zip.file(relsPath)!.asText();
  const rIdDe = new Map<string, string>();
  let n = 0;
  for (const [caminho, bytes] of imagens) {
    n++;
    const rId = `rIdFluxi${n}`;
    zip.file(`word/media/fluxi_tela_${n}.png`, bytes);
    rels = rels.replace('</Relationships>', `<Relationship Id="${rId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/fluxi_tela_${n}.png"/></Relationships>`);
    rIdDe.set(caminho, rId);
  }
  let rIdLink: string | null = null;
  if (dados.link_fluxograma) {
    rIdLink = 'rIdFluxiLink';
    rels = rels.replace('</Relationships>', `<Relationship Id="${rIdLink}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="${esc(dados.link_fluxograma)}" TargetMode="External"/></Relationships>`);
  }
  zip.file(relsPath, rels);

  const comum = cabecalho(dados);
  const numeracao = new Numeracao();
  let figura = 0;
  const itens = sequenciaPassos(dados).map((item) => {
    if (item.tipo === 'subtitulo') return { bloco: paragrafoSubtitulo(item.texto) };
    const { passo, texto, numero } = item;
    const rId = passo.imagem_caminho ? rIdDe.get(passo.imagem_caminho) : undefined;
    if (!rId) return { bloco: texto ? caixaTexto(`Passo ${numero}:`, texto, LARGURA_CAIXA_TWIPS, numeracao) : '' };
    figura++;
    const { cx, cy } = tamanhoImagem(passo.imagem_largura ?? 1600, passo.imagem_altura ?? 900);
    const imagem = paragrafoImagem(rId, 1000 + figura, cx, cy, `Tela ${figura}`, !!texto);
    return { bloco: texto ? imagem + caixaTexto(`Passo ${numero}:`, texto, Math.round(cx / EMU_POR_TWIP), numeracao) : imagem };
  });
  // Objetivo: o modelo tem um parágrafo NoSpacing, cor do texto e sem negrito (a tabela aplicaria negrito).
  const objetivo = paragrafosXml(dados.objetivo, { base: { cor: COR_TEXTO, semNegrito: true }, numeracao, estilo: 'NoSpacing' });

  const contexto = {
    area: dados.area,
    nomeProcedimento: dados.nome,
    mesAno: comum.mesAno,
    versao: dados.versao,
    dataCriacao: comum.dataCriacao,
    codigoProcesso: dados.codigo,
    identificacaoPop: dados.identificacao,
    executor: dados.executor,
    objetivo,
    envolvidos: comum.envolvidos,
    descricaoFluxograma: DESCRICAO_FLUXOGRAMA,
    linkFluxograma: paragrafoLink(rIdLink),
    itens,
    historico: comum.historico,
  };

  const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true, nullGetter: () => '' });
  doc.render(contexto);
  const saida = doc.getZip();
  const numbering = saida.file('word/numbering.xml');
  if (numbering) saida.file('word/numbering.xml', numeracao.aplicar(numbering.asText()));
  return saida.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
}
