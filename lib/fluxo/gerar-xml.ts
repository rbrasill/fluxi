// Converte o FluxoSchema (saída da IA) em XML do draw.io, com raias horizontais
// e layout em colunas: cada nó vai para a coluna seguinte à do seu antecessor.
import { COR_ROTULO, ESTILO_ALERTA, ESTILO_LIGACAO_NOTA, ESTILO_NO, ESTILO_NOTA, ESTILO_RAIA, ESTILO_SETA } from './estilos';
import type { Fluxo } from './schema';

const COL_W = 220;
const LINHA_H = 120;
const MARGEM_RAIA = 40; // faixa do nome da raia
const PAD = 40;
const RAIA_W_MIN = 800;

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function colunas(fluxo: Fluxo): Map<string, number> {
  const ids = new Set(fluxo.nos.map((n) => n.id));
  const saidas = new Map<string, string[]>();
  const grauEntrada = new Map<string, number>([...ids].map((id) => [id, 0]));
  for (const c of fluxo.conexoes) {
    if (!ids.has(c.de) || !ids.has(c.para)) continue;
    saidas.set(c.de, [...(saidas.get(c.de) || []), c.para]);
    grauEntrada.set(c.para, (grauEntrada.get(c.para) || 0) + 1);
  }
  const col = new Map<string, number>();
  const inicios = fluxo.nos.filter((n) => n.tipo.startsWith('inicio') || grauEntrada.get(n.id) === 0).map((n) => n.id);
  const fila = (inicios.length ? inicios : [fluxo.nos[0]?.id]).filter(Boolean) as string[];
  fila.forEach((id) => col.set(id, 0));
  // BFS: coluna = menor profundidade a partir de um início (evita crescer em laços).
  for (let i = 0; i < fila.length; i++) {
    const atual = fila[i];
    for (const prox of saidas.get(atual) || []) {
      if (!col.has(prox)) {
        col.set(prox, (col.get(atual) || 0) + 1);
        fila.push(prox);
      }
    }
  }
  let extra = Math.max(0, ...col.values()) + 1;
  for (const n of fluxo.nos) if (!col.has(n.id)) col.set(n.id, extra++);
  return col;
}

export function gerarXml(fluxo: Fluxo): string {
  const col = colunas(fluxo);
  const raias = fluxo.raias.length ? fluxo.raias : [{ id: 'r1', area: 'Processo' }];
  const raiaDe = (id: string) => (raias.some((r) => r.id === id) ? id : raias[0].id);

  // Linha de cada nó dentro da raia: evita sobrepor nós na mesma raia e coluna.
  const ocupado = new Map<string, number>();
  const linha = new Map<string, number>();
  for (const n of fluxo.nos) {
    const k = `${raiaDe(n.raia)}:${col.get(n.id)}`;
    const l = ocupado.get(k) || 0;
    linha.set(n.id, l);
    ocupado.set(k, l + 1);
  }
  const maxCol = Math.max(0, ...col.values());
  const largura = Math.max(RAIA_W_MIN, MARGEM_RAIA + PAD * 2 + (maxCol + 1) * COL_W);

  const celulas: string[] = [];
  let y = 0;
  const posRaia = new Map<string, number>();
  for (const r of raias) {
    const linhas = Math.max(1, ...fluxo.nos.filter((n) => raiaDe(n.raia) === r.id).map((n) => (linha.get(n.id) || 0) + 1));
    const altura = PAD * 2 + linhas * LINHA_H - (LINHA_H - 60);
    posRaia.set(r.id, y);
    celulas.push(
      `<mxCell id="raia_${esc(r.id)}" value="${esc(r.area)}" style="${ESTILO_RAIA}" vertex="1" parent="1"><mxGeometry x="0" y="${y}" width="${largura}" height="${Math.max(altura, 180)}" as="geometry"/></mxCell>`,
    );
    y += Math.max(altura, 180);
  }

  const centro = new Map<string, { x: number; y: number }>();
  for (const n of fluxo.nos) {
    const e = ESTILO_NO[n.tipo];
    const cx = MARGEM_RAIA + PAD + (col.get(n.id) || 0) * COL_W + 80;
    const cy = PAD + 30 + (linha.get(n.id) || 0) * LINHA_H;
    centro.set(n.id, { x: cx, y: (posRaia.get(raiaDe(n.raia)) || 0) + cy });
    const texto = n.tipo === 'inicio' ? n.texto || 'Início' : n.tipo === 'fim' ? n.texto || 'Fim' : n.texto;
    celulas.push(
      `<mxCell id="n_${esc(n.id)}" value="${esc(texto)}" style="${e.estilo}" vertex="1" parent="raia_${esc(raiaDe(n.raia))}"><mxGeometry x="${cx - e.w / 2}" y="${cy - e.h / 2}" width="${e.w}" height="${e.h}" as="geometry"/></mxCell>`,
    );
  }

  const ids = new Set(fluxo.nos.map((n) => n.id));
  fluxo.conexoes.forEach((c, i) => {
    if (!ids.has(c.de) || !ids.has(c.para)) return;
    const cor = c.rotulo ? COR_ROTULO[c.rotulo.trim().toLowerCase()] : undefined;
    const estilo = ESTILO_SETA + (cor ? `fontColor=${cor};` : '');
    celulas.push(
      `<mxCell id="c_${i}" value="${esc(c.rotulo || '')}" style="${estilo}" edge="1" parent="1" source="n_${esc(c.de)}" target="n_${esc(c.para)}"><mxGeometry relative="1" as="geometry"/></mxCell>`,
    );
  });

  (fluxo.anotacoes || []).forEach((a, i) => {
    const p = centro.get(a.no);
    if (!p) return;
    celulas.push(
      `<mxCell id="a_${i}" value="${esc(a.texto)}" style="${a.tipo === 'alerta' ? ESTILO_ALERTA : ESTILO_NOTA}" vertex="1" parent="1"><mxGeometry x="${p.x + 40}" y="${p.y - 90}" width="170" height="50" as="geometry"/></mxCell>`,
      `<mxCell id="al_${i}" style="${ESTILO_LIGACAO_NOTA}" edge="1" parent="1" source="a_${i}" target="n_${esc(a.no)}"><mxGeometry relative="1" as="geometry"/></mxCell>`,
    );
  });

  return `<mxGraphModel grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" page="0"><root><mxCell id="0"/><mxCell id="1" parent="0"/>${celulas.join('')}</root></mxGraphModel>`;
}
