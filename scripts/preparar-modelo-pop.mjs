// Gera, a partir do modelo original (templates/pop/Modelo_POP_v3.docx):
//  - templates/pop/modelo-pop-v3.template.docx: os textos de exemplo viram marcadores do
//    docxtemplater, mantendo toda a formatação;
//  - templates/pop/imagens/*.png: logo, ícones e decoração do modelo, usados na versão em PDF.
// Rodar: npm run modelo-pop
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import PizZip from 'pizzip';
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';
import { PNG } from 'pngjs';

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const WP = 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing';
const A = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const origem = new URL('../templates/pop/Modelo_POP_v3.docx', import.meta.url);
const destino = new URL('../templates/pop/modelo-pop-v3.template.docx', import.meta.url);
const pastaImagens = new URL('../templates/pop/imagens/', import.meta.url);

const zip = new PizZip(readFileSync(origem));
const doc = new DOMParser().parseFromString(zip.file('word/document.xml').asText(), 'text/xml');
const relsPath = 'word/_rels/document.xml.rels';
const rels = new DOMParser().parseFromString(zip.file(relsPath).asText(), 'text/xml');
const alvoDe = new Map(Array.from(rels.getElementsByTagName('Relationship')).map((r) => [r.getAttribute('Id'), r.getAttribute('Target')]));

const el = (nome) => Array.from(doc.getElementsByTagNameNS(W, nome));
const filhos = (n, nome) => Array.from(n.childNodes).filter((c) => c.nodeType === 1 && c.localName === nome);
const texto = (n) => Array.from(n.getElementsByTagNameNS(W, 't')).map((t) => t.textContent).join('');
const temDesenho = (n) => n.nodeType === 1 && n.getElementsByTagNameNS(W, 'drawing').length > 0;

/** Troca o texto do parágrafo por partes [texto, 'primeiro'|'ultimo'], mantendo o estilo das runs e os desenhos (ícones). */
function definir(p, partes) {
  const runs = Array.from(p.getElementsByTagNameNS(W, 'r')).filter((r) => !temDesenho(r));
  const rPr = (r) => (r ? filhos(r, 'rPr')[0] : undefined);
  const estilos = { primeiro: rPr(runs[0]), ultimo: rPr(runs[runs.length - 1]) };
  for (const c of Array.from(p.childNodes)) if (c.nodeType === 1 && c.localName !== 'pPr' && !temDesenho(c)) p.removeChild(c);
  for (const [t, estilo = 'primeiro'] of partes) {
    const r = doc.createElementNS(W, 'w:r');
    if (estilos[estilo]) r.appendChild(estilos[estilo].cloneNode(true));
    const wt = doc.createElementNS(W, 'w:t');
    wt.setAttribute('xml:space', 'preserve');
    wt.textContent = t;
    r.appendChild(wt);
    p.appendChild(r);
  }
}

/** Mantém só o primeiro parágrafo da célula e define o texto dele. */
function celula(tc, partes) {
  const ps = filhos(tc, 'p');
  ps.slice(1).forEach((p) => tc.removeChild(p));
  definir(ps[0], partes);
  return ps[0];
}

/** Célula com vários parágrafos (rótulo em cima, valor embaixo): `null` mantém o parágrafo como está. */
function celulaLinhas(tc, linhas) {
  const ps = filhos(tc, 'p');
  if (ps.length < linhas.length) throw new Error(`Célula com menos parágrafos que o esperado: "${texto(tc)}"`);
  ps.slice(linhas.length).forEach((p) => tc.removeChild(p));
  linhas.forEach((partes, i) => partes && definir(ps[i], partes));
}

function paragrafoCom(textoExato) {
  const p = el('p').find((p) => texto(p).trim() === textoExato);
  if (!p) throw new Error(`Parágrafo não encontrado: ${textoExato}`);
  return p;
}
const tabelaCom = (trecho) => {
  const t = el('tbl').find((t) => texto(t).includes(trecho));
  if (!t) throw new Error(`Tabela não encontrada: ${trecho}`);
  return t;
};
const tabelaExata = (textoExato) => {
  const t = el('tbl').find((t) => texto(t).trim() === textoExato);
  if (!t) throw new Error(`Tabela não encontrada: ${textoExato}`);
  return t;
};
const celulas = (tr) => filhos(tr, 'tc');
const linhas = (tbl) => filhos(tbl, 'tr');

function novoParagrafo(antesDe, conteudo, pPrDe) {
  const p = doc.createElementNS(W, 'w:p');
  if (pPrDe) {
    const pPr = filhos(pPrDe, 'pPr')[0];
    if (pPr) {
      const copia = pPr.cloneNode(true);
      filhos(copia, 'numPr').forEach((n) => copia.removeChild(n));
      p.appendChild(copia);
    }
  }
  const r = doc.createElementNS(W, 'w:r');
  const t = doc.createElementNS(W, 'w:t');
  t.setAttribute('xml:space', 'preserve');
  t.textContent = conteudo;
  r.appendChild(t);
  p.appendChild(r);
  antesDe.parentNode.insertBefore(p, antesDe);
  return p;
}

// ---------------------------------------------------------------------------
// Imagens do modelo (logo, ícones, decoração) para a versão em PDF.

/** Desenhos de um nó, na ordem do documento: id da imagem, tamanho (EMU) e recorte. */
function desenhos(n) {
  const lista = [];
  for (const tag of ['anchor', 'inline']) {
    for (const d of Array.from(n.getElementsByTagNameNS(WP, tag))) {
      const ext = d.getElementsByTagNameNS(WP, 'extent')[0];
      const blip = d.getElementsByTagNameNS(A, 'blip')[0];
      if (!ext || !blip) continue;
      const rId = blip.getAttributeNS(R, 'embed');
      const src = d.getElementsByTagNameNS(A, 'srcRect')[0];
      const rec = src ? { t: +(src.getAttribute('t') || 0), b: +(src.getAttribute('b') || 0), l: +(src.getAttribute('l') || 0), r: +(src.getAttribute('r') || 0) } : null;
      lista.push({ rId, alvo: alvoDe.get(rId), cx: +ext.getAttribute('cx'), cy: +ext.getAttribute('cy'), recorte: rec, efeitos: efeitosDe(blip), ancorado: tag === 'anchor' });
    }
  }
  return lista;
}
const pngs = (lista) => lista.filter((d) => d.alvo && d.alvo.endsWith('.png'));
const menor = (lista) => pngs(lista).reduce((m, d) => (!m || d.cx < m.cx ? d : m), null);

// --- Efeitos de cor do Word na imagem (o PDF não tem como aplicar: são "assados" no PNG) ---

const tema = new DOMParser().parseFromString(zip.file('word/theme/theme1.xml').asText(), 'text/xml');
const MAPA_TEMA = { bg1: 'lt1', tx1: 'dk1', bg2: 'lt2', tx2: 'dk2' };
const PRESETS = { white: [255, 255, 255], black: [0, 0, 0] };
const paraLinear = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const paraSrgb = (c) => Math.round(255 * Math.min(1, Math.max(0, c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055)));

/** Cor DrawingML (srgbClr, schemeClr ou prstClr) com shade/tint (em RGB linear, como o Office) e satMod. */
function corDrawingML(n) {
  let rgb;
  if (n.localName === 'srgbClr') rgb = [0, 2, 4].map((i) => parseInt(n.getAttribute('val').slice(i, i + 2), 16));
  else if (n.localName === 'prstClr') rgb = PRESETS[n.getAttribute('val')] ?? [0, 0, 0];
  else if (n.localName === 'schemeClr') {
    const nome = MAPA_TEMA[n.getAttribute('val')] ?? n.getAttribute('val');
    const def = tema.getElementsByTagNameNS(A, nome)[0];
    const filho = def && Array.from(def.childNodes).find((c) => c.nodeType === 1);
    rgb = filho?.localName === 'srgbClr' ? corDrawingML(filho) : filho?.localName === 'sysClr' ? [0, 2, 4].map((i) => parseInt(filho.getAttribute('lastClr').slice(i, i + 2), 16)) : [0, 0, 0];
  } else return [0, 0, 0];
  for (const m of Array.from(n.childNodes).filter((c) => c.nodeType === 1)) {
    const v = +m.getAttribute('val') / 100000;
    if (m.localName === 'shade') rgb = rgb.map((c) => paraSrgb(paraLinear(c) * v));
    else if (m.localName === 'tint') rgb = rgb.map((c) => paraSrgb(1 - (1 - paraLinear(c)) * v));
    else if (m.localName === 'satMod') {
      const media = (rgb[0] + rgb[1] + rgb[2]) / 3;
      rgb = rgb.map((c) => Math.round(Math.min(255, Math.max(0, media + (c - media) * v))));
    }
  }
  return rgb;
}

/** Duotone e transparência (alphaModFix) do blip, se houver. */
function efeitosDe(blip) {
  const duo = blip.getElementsByTagNameNS(A, 'duotone')[0];
  const cores = duo ? Array.from(duo.childNodes).filter((c) => c.nodeType === 1).map(corDrawingML) : null;
  const alfa = blip.getElementsByTagNameNS(A, 'alphaModFix')[0];
  return { duotone: cores?.length === 2 ? cores : null, opacidade: alfa ? +(alfa.getAttribute('amt') ?? 100000) / 100000 : 1 };
}

/** Aplica no PNG o que o Word aplica na hora de mostrar: duotone (luminância entre duas cores) e opacidade. */
function aplicarEfeitos(bytes, ef) {
  if (!ef || (!ef.duotone && ef.opacidade === 1)) return bytes;
  const img = PNG.sync.read(bytes);
  for (let i = 0; i < img.data.length; i += 4) {
    if (ef.duotone) {
      const [c1, c2] = ef.duotone;
      const lum = (0.299 * img.data[i] + 0.587 * img.data[i + 1] + 0.114 * img.data[i + 2]) / 255;
      for (let k = 0; k < 3; k++) img.data[i + k] = Math.round(c1[k] + (c2[k] - c1[k]) * lum);
    }
    img.data[i + 3] = Math.round(img.data[i + 3] * ef.opacidade);
  }
  return PNG.sync.write(img);
}

/** Recorta um PNG conforme o srcRect do Word (frações em 1/1000 %). */
function recortar(bytes, rec) {
  const img = PNG.sync.read(bytes);
  const x0 = Math.round((img.width * rec.l) / 100000);
  const x1 = img.width - Math.round((img.width * rec.r) / 100000);
  const y0 = Math.round((img.height * rec.t) / 100000);
  const y1 = img.height - Math.round((img.height * rec.b) / 100000);
  const saida = new PNG({ width: x1 - x0, height: y1 - y0 });
  PNG.bitblt(img, saida, x0, y0, saida.width, saida.height, 0, 0);
  return PNG.sync.write(saida);
}

mkdirSync(pastaImagens, { recursive: true });
function exportar(nome, d) {
  if (!d) throw new Error(`Imagem não encontrada: ${nome}`);
  let bytes = zip.file(`word/${d.alvo}`).asNodeBuffer();
  if (d.recorte && (d.recorte.t || d.recorte.b || d.recorte.l || d.recorte.r)) bytes = recortar(bytes, d.recorte);
  bytes = aplicarEfeitos(bytes, d.efeitos);
  writeFileSync(new URL(`${nome}.png`, pastaImagens), bytes);
}

{
  const corpo = doc.getElementsByTagNameNS(W, 'body')[0];
  const primeiro = filhos(corpo, 'p')[0];
  const topo = desenhos(primeiro);
  exportar('faixa', topo.find((d) => d.ancorado));
  exportar('logo', topo.find((d) => !d.ancorado));
  exportar('area', menor(desenhos(paragrafoCom('Comercial'))));
  exportar('procedimento', menor(desenhos(paragrafoCom('Procedimento').previousSibling)));
  exportar('executor', menor(desenhos(celulas(linhas(tabelaCom('Executor do Processo'))[0])[0])));
  const objetivo = desenhos(tabelaExata('Objetivo do Processo'));
  exportar('objetivo', menor(objetivo));
  exportar('decoracao', pngs(objetivo).find((d) => d !== menor(objetivo)));
  exportar('envolvidos', menor(desenhos(tabelaExata('Envolvidos'))));
  exportar('recursos', menor(desenhos(tabelaExata('Recursos do Processo'))));
  exportar('procedimentos', menor(desenhos(tabelaExata('Procedimentos'))));
}

// ---------------------------------------------------------------------------
// Marcadores do docxtemplater.

// Cabeçalho da área (o ícone ao lado fica)
definir(paragrafoCom('Comercial'), [['{area}']]);

// Procedimento / mês-ano / versão
{
  const [a, b, c] = celulas(linhas(tabelaCom('Contrato Permuta'))[0]);
  celula(a, [['{nomeProcedimento}']]);
  celula(b, [['{mesAno}']]);
  celula(c, [['Versão: ', 'primeiro'], ['{versao}', 'ultimo']]);
}

// Identificação: rótulo em cima (fica como no modelo), valor embaixo
{
  const [a, b, c] = celulas(linhas(tabelaCom('Data Criação'))[0]);
  celulaLinhas(a, [null, [['{dataCriacao}']]]);
  celulaLinhas(b, [null, [['{codigoProcesso}']]]);
  celulaLinhas(c, [null, [['{identificacaoPop}']]]);
}

// Executor
celula(celulas(linhas(tabelaCom('Executor do Processo'))[0])[2], [['{executor}']]);

// Objetivo (a tabela de texto logo após o título "Objetivo do Processo")
{
  const t = el('tbl').find((t) => texto(t).startsWith('Lorem ipsum'));
  celula(celulas(linhas(t)[0])[0], [['{@objetivo}']]); // parágrafos com formatação, montados em lib/pop/docx.ts
}

// Envolvidos: uma linha repetida por par área/cargo
{
  const t = tabelaCom('Diretor de Expansão');
  const [primeira, ...resto] = linhas(t);
  resto.forEach((l) => t.removeChild(l));
  const [a, b] = celulas(primeira);
  celula(a, [['{#envolvidos}{area}']]);
  celula(b, [['{cargo}{/envolvidos}']]);
}

// Recursos: link do fluxograma (parágrafo substituído por XML com hiperlink)
{
  const [, desc, link] = celulas(linhas(tabelaCom('Abrir diagrama'))[0]);
  celula(desc, [['{descricaoFluxograma}']]);
  celula(link, [['{@linkFluxograma}']]);
}

// Procedimentos: no modelo há um print de exemplo com a caixa "Passo 1:" abaixo. Sai o exemplo e
// entra um loop de blocos de XML montados em lib/pop/docx.ts (subtítulo, print e caixa de cada passo).
{
  const titulo = tabelaExata('Procedimentos');
  const historico = paragrafoCom('Históricos de Revisões');
  // A régua laranja (forma de 54000 EMU de altura) que antecede o histórico marca o fim da seção.
  let regua = historico.previousSibling;
  while (regua && !(regua.nodeType === 1 && regua.localName === 'p' && regua.toString().includes('cy="54000"'))) regua = regua.previousSibling;
  if (!regua) throw new Error('Régua antes de "Históricos de Revisões" não encontrada');
  for (let n = titulo.nextSibling; n && n !== regua; ) {
    const prox = n.nextSibling;
    n.parentNode.removeChild(n);
    n = prox;
  }
  novoParagrafo(regua, '', historico);
  novoParagrafo(regua, '{#itens}', historico);
  novoParagrafo(regua, '{@bloco}', historico);
  novoParagrafo(regua, '{/itens}', historico);
  novoParagrafo(regua, '', historico);
}

// Histórico de revisões: uma linha por revisão
{
  const t = tabelaCom('Elaborado por');
  const [, linha] = linhas(t);
  const [a, b, c] = celulas(linha);
  celula(a, [['{#historico}{data}']]);
  celula(b, [['{elaboradoPor}']]);
  celula(c, [['{revisao}{/historico}']]);
}

// Remove do pacote as imagens que só o exemplo usava (ex.: o print de amostra).
{
  const xml = new XMLSerializer().serializeToString(doc);
  const usados = new Set((xml.match(/r:embed="([^"]+)"/g) || []).map((s) => s.slice(9, -1)));
  for (const rel of Array.from(rels.getElementsByTagName('Relationship'))) {
    if (rel.getAttribute('Type').endsWith('/image') && !usados.has(rel.getAttribute('Id'))) {
      zip.remove(`word/${rel.getAttribute('Target')}`);
      rel.parentNode.removeChild(rel);
    }
  }
  zip.file('word/document.xml', xml);
  zip.file(relsPath, new XMLSerializer().serializeToString(rels));
}

writeFileSync(destino, zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' }));
console.log('Modelo gerado:', destino.pathname);
console.log('Imagens em:', pastaImagens.pathname);
