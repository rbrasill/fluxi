// Converte templates/drawio/biblioteca-estilos.xml (um diagrama com os elementos)
// em public/drawio/biblioteca-inc.json, no formato de biblioteca do draw.io
// ([{ xml, w, h, title }]), usado na configuração do editor embed.
import { readFileSync, writeFileSync } from 'node:fs';
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';

const src = readFileSync(new URL('../templates/drawio/biblioteca-estilos.xml', import.meta.url), 'utf8');
const doc = new DOMParser().parseFromString(src, 'text/xml');
const root = doc.getElementsByTagName('root')[0];
const ser = new XMLSerializer();

const itens = Array.from(root.childNodes).filter((n) => n.nodeType === 1);
const cellDe = (n) => (n.tagName === 'mxCell' ? n : n.getElementsByTagName('mxCell')[0]);
const parentDe = (n) => n.getAttribute('parent') || cellDe(n)?.getAttribute('parent');

function descendentes(id) {
  const filhos = itens.filter((n) => parentDe(n) === id);
  return filhos.flatMap((f) => [f, ...descendentes(f.getAttribute('id'))]);
}

const biblioteca = itens
  .filter((n) => parentDe(n) === '1')
  .map((n) => {
    const geo = cellDe(n).getElementsByTagName('mxGeometry')[0];
    const w = Number(geo?.getAttribute('width') || 80);
    const h = Number(geo?.getAttribute('height') || 40);
    const copia = n.cloneNode(true);
    const g = cellDe(copia).getElementsByTagName('mxGeometry')[0];
    if (g) { g.removeAttribute('x'); g.removeAttribute('y'); }
    const partes = [copia, ...descendentes(n.getAttribute('id'))].map((x) => ser.serializeToString(x)).join('');
    const xml = `<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/>${partes}</root></mxGraphModel>`;
    const tip = n.getAttribute('tooltip') || '';
    const title = (tip.match(/Elemento:\s*([^\n]+)/) || [])[1]?.trim() || n.getAttribute('label') || 'Elemento';
    return { xml, w, h, title, aspect: 'fixed' };
  });

writeFileSync(new URL('../public/drawio/biblioteca-inc.json', import.meta.url), JSON.stringify(biblioteca));
console.log(`${biblioteca.length} elementos gerados`);
