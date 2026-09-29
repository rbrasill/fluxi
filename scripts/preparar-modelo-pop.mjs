// Gera templates/pop/modelo-pop-v3.template.docx a partir do modelo original
// (templates/pop/Modelo_POP_v3.docx), trocando os textos de exemplo pelos
// marcadores do docxtemplater e mantendo toda a formatação.
// Rodar: npm run modelo-pop
import { readFileSync, writeFileSync } from 'node:fs';
import PizZip from 'pizzip';
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const origem = new URL('../templates/pop/Modelo_POP_v3.docx', import.meta.url);
const destino = new URL('../templates/pop/modelo-pop-v3.template.docx', import.meta.url);

const zip = new PizZip(readFileSync(origem));
const doc = new DOMParser().parseFromString(zip.file('word/document.xml').asText(), 'text/xml');
const el = (nome) => Array.from(doc.getElementsByTagNameNS(W, nome));
const filhos = (n, nome) => Array.from(n.childNodes).filter((c) => c.nodeType === 1 && c.localName === nome);
const texto = (n) => Array.from(n.getElementsByTagNameNS(W, 't')).map((t) => t.textContent).join('');

/** Troca o texto do parágrafo por partes [texto, 'primeiro'|'ultimo'] mantendo o estilo das runs originais. */
function definir(p, partes) {
  const runs = Array.from(p.getElementsByTagNameNS(W, 'r'));
  const rPr = (r) => (r ? filhos(r, 'rPr')[0] : undefined);
  const estilos = { primeiro: rPr(runs[0]), ultimo: rPr(runs[runs.length - 1]) };
  for (const c of Array.from(p.childNodes)) if (c.nodeType === 1 && c.localName !== 'pPr') p.removeChild(c);
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
const depois = (n) => n.nextSibling;

// Cabeçalho da área
definir(paragrafoCom('Comercial'), [['{area}']]);

// Procedimento / mês-ano / versão
{
  const [a, b, c] = celulas(linhas(tabelaCom('Contrato Permuta'))[0]);
  celula(a, [['{nomeProcedimento}']]);
  celula(b, [['{mesAno}']]);
  celula(c, [['Versão: ', 'primeiro'], ['{versao}', 'ultimo']]);
}

// Identificação
{
  const [a, b, c] = celulas(linhas(tabelaCom('Data Criação'))[0]);
  celula(a, [['Data Criação: ', 'primeiro'], ['{dataCriacao}', 'ultimo']]);
  celula(b, [['Código do Processo: ', 'primeiro'], ['{codigoProcesso}', 'ultimo']]);
  celula(c, [['Identificação POP: ', 'primeiro'], ['{identificacaoPop}', 'ultimo']]);
}

// Executor
celula(celulas(linhas(tabelaCom('Executor do Processo'))[0])[2], [['{executor}']]);

// Objetivo (a tabela do texto logo após o título "Objetivo do Processo")
{
  const t = el('tbl').find((t) => texto(t).startsWith('Lorem ipsum') && !texto(t).includes('Procedimento'));
  celula(celulas(linhas(t)[0])[0], [['{objetivo}']]);
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

// Procedimentos: uma tabela repetida por procedimento, com os passos em tópicos
// e, abaixo da tabela, as telas marcadas na gravação (largura total da página).
{
  const tabelas = el('tbl').filter((t) => /#0\d/.test(texto(t)));
  const [modelo, ...extras] = tabelas;
  for (const t of extras) {
    const prox = t.nextSibling;
    if (prox && prox.nodeType === 1 && prox.localName === 'p' && !texto(prox).trim()) prox.parentNode.removeChild(prox);
    t.parentNode.removeChild(t);
  }
  const [nome, desc] = celulas(linhas(modelo)[0]);
  celula(nome, [['{nome}']]);
  const bullet = filhos(desc, 'p')[0];
  celula(desc, [['{texto}']]);
  novoParagrafo(bullet, '{#passos}', bullet);
  const fim = doc.createElementNS(W, 'w:p');
  desc.appendChild(fim);
  novoParagrafo(fim, '{/passos}', bullet);
  desc.removeChild(fim);

  const aposTabela = depois(modelo);
  novoParagrafo(modelo, '{#procedimentos}');
  const ancora = aposTabela ?? modelo.parentNode.appendChild(doc.createElementNS(W, 'w:p'));
  novoParagrafo(ancora, '{#telas}');
  novoParagrafo(ancora, '{@imagem}');
  const legenda = novoParagrafo(ancora, '{legenda}');
  const rPr = doc.createElementNS(W, 'w:rPr');
  rPr.appendChild(doc.createElementNS(W, 'w:i'));
  const sz = doc.createElementNS(W, 'w:sz');
  sz.setAttribute('w:val', '18');
  rPr.appendChild(sz);
  const col = doc.createElementNS(W, 'w:color');
  col.setAttribute('w:val', '5B6B70');
  rPr.appendChild(col);
  const r = legenda.getElementsByTagNameNS(W, 'r')[0];
  r.insertBefore(rPr, r.firstChild);
  novoParagrafo(ancora, '{/telas}');
  novoParagrafo(ancora, '');
  novoParagrafo(ancora, '{/procedimentos}');
}

// Histórico: uma linha por revisão
{
  const t = tabelaCom('Elaborado por');
  const [, linha] = linhas(t);
  const [a, b, c] = celulas(linha);
  celula(a, [['{#historico}{data}']]);
  celula(b, [['{elaboradoPor}']]);
  celula(c, [['{revisao}{/historico}']]);
}

zip.file('word/document.xml', new XMLSerializer().serializeToString(doc));
writeFileSync(destino, zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' }));
console.log('Modelo gerado:', destino.pathname);
