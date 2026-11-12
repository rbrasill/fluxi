// Converte templates/drawio/biblioteca-estilos.xml (a folha "Biblioteca de Processos", com os elementos
// separados por seção e uma legenda embaixo de cada um) em public/drawio/biblioteca-inc.json, no formato
// de biblioteca do draw.io ([{ xml, w, h, title }]), usado na configuração do editor embed.
// Elemento é todo <UserObject> solto na folha; título, seções ("sec-…") e legendas ("cap-…") não entram.
import { readFileSync, writeFileSync } from 'node:fs';
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';

const src = readFileSync(new URL('../templates/drawio/biblioteca-estilos.xml', import.meta.url), 'utf8');
const doc = new DOMParser().parseFromString(src, 'text/xml');
const root = doc.getElementsByTagName('root')[0];
const ser = new XMLSerializer();

const itens = Array.from(root.childNodes).filter((n) => n.nodeType === 1);
const cellDe = (n) => (n.tagName === 'mxCell' ? n : n.getElementsByTagName('mxCell')[0]);
const parentDe = (n) => n.getAttribute('parent') || cellDe(n)?.getAttribute('parent');
const geoDe = (n) => cellDe(n).getElementsByTagName('mxGeometry')[0];
const num = (g, a) => Number(g?.getAttribute(a) || 0);

function descendentes(id) {
  const filhos = itens.filter((n) => parentDe(n) === id);
  return filhos.flatMap((f) => [f, ...descendentes(f.getAttribute('id'))]);
}

// O nome de cada elemento na biblioteca: a legenda que vem logo depois dele na folha (e a seção, nos gateways).
let secao = '';
const nomes = new Map();
let ultimo = null;
for (const n of itens) {
  const id = n.getAttribute('id') || '';
  if (id.startsWith('sec-')) { secao = n.getAttribute('value') || ''; ultimo = null; }
  else if (id.startsWith('cap-')) { if (ultimo) nomes.set(ultimo, (secao === 'Gateways' ? 'Gateway ' : '') + (secao === 'Gateways' ? n.getAttribute('value').toLowerCase() : n.getAttribute('value'))); ultimo = null; }
  else if (n.tagName === 'UserObject' && parentDe(n) === '1') ultimo = id;
}

const biblioteca = itens
  .filter((n) => n.tagName === 'UserObject' && parentDe(n) === '1')
  .map((n) => {
    const copia = n.cloneNode(true);
    const cell = cellDe(copia);
    const g = geoDe(copia);
    const filhos = descendentes(n.getAttribute('id')).map((f) => f.cloneNode(true));
    let w = num(g, 'width') || 80, h = num(g, 'height') || 40;
    if (cell.getAttribute('edge') === '1') {
      // Seta: os dois pontos passam a começar na origem, para a seta cair onde a pessoa soltar.
      const pontos = Array.from(g.getElementsByTagName('mxPoint'));
      const [x0, y0] = [Math.min(...pontos.map((p) => num(p, 'x'))), Math.min(...pontos.map((p) => num(p, 'y')))];
      for (const p of pontos) { p.setAttribute('x', String(num(p, 'x') - x0)); p.setAttribute('y', String(num(p, 'y') - y0)); }
      w = Math.max(...pontos.map((p) => num(p, 'x'))) || 50;
      h = Math.max(10, ...pontos.map((p) => num(p, 'y')));
    } else {
      g.removeAttribute('x'); g.removeAttribute('y');
      // Grupo menor que o que tem dentro (o alerta): cresce até caber o maior filho.
      if ((cell.getAttribute('style') || '').startsWith('group')) {
        for (const f of filhos.filter((f) => parentDe(f) === n.getAttribute('id'))) {
          const gf = geoDe(f);
          if (gf.getAttribute('relative') !== '1') w = Math.max(w, num(gf, 'x') + num(gf, 'width')), h = Math.max(h, num(gf, 'y') + num(gf, 'height'));
        }
        g.setAttribute('width', String(w)); g.setAttribute('height', String(h));
      }
    }
    const partes = [copia, ...filhos].map((x) => ser.serializeToString(x)).join('');
    const xml = `<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/>${partes}</root></mxGraphModel>`;
    const tip = n.getAttribute('tooltip') || '';
    const title = nomes.get(n.getAttribute('id')) || (tip.match(/Elemento:\s*([^\n]+)/) || [])[1]?.trim() || n.getAttribute('label') || 'Elemento';
    return { xml, w, h, title, aspect: 'fixed' };
  });

// Nomes repetidos (as três caixas de "Evento ocorrido") ganham um número.
const vezes = new Map();
for (const b of biblioteca) vezes.set(b.title, (vezes.get(b.title) ?? 0) + 1);
const visto = new Map();
for (const b of biblioteca) if (vezes.get(b.title) > 1) { const n = (visto.get(b.title) ?? 0) + 1; visto.set(b.title, n); b.title = `${b.title} ${n}`; }

writeFileSync(new URL('../public/drawio/biblioteca-inc.json', import.meta.url), JSON.stringify(biblioteca));
console.log(`${biblioteca.length} elementos gerados:`);
for (const b of biblioteca) console.log(` - ${b.title} (${b.w}×${b.h})`);
