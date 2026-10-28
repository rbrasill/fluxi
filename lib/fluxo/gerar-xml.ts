// Converte o FluxoSchema (saída da IA) em XML do draw.io, com os elementos da biblioteca BPMN INC.
// Layout em camadas com raias horizontais, para o diagrama sair organizado:
// 1. as setas de volta (laços) são separadas, e o resto vira um fluxo da esquerda para a direita;
// 2. coluna = maior distância desde o início, então toda seta de ida aponta para a direita;
// 3. cada nó ocupa uma trilha (linha) da sua raia: o caminho principal segue reto e os desvios descem;
// 4. as setas passam pelos corredores entre colunas e entre trilhas, nunca por cima de uma caixa.
import {
  COR_INDICADOR, ESTILO_ALERTA, ESTILO_INDICADOR, ESTILO_LIGACAO_NOTA, ESTILO_NO, ESTILO_NOTA, ESTILO_RAIA,
  ESTILO_RAIA_NOME, ESTILO_ROTULO, ESTILO_SETA, ESTILO_TEXTO_EVENTO,
} from './estilos';
import type { Fluxo, TipoNo } from './schema';

const NO_W = 160;
const CORREDOR = 50; // espaço entre colunas; cresce quando a condição escrita na seta é longa
const TRILHA_H = 140; // pergunta acima do gateway, nó e texto abaixo do evento
const NO_Y = 75; // centro do nó a partir do topo da trilha
const RAIA_TOPO = 48; // etiqueta com o nome da área
const RAIA_BASE = 20;
const ESQ = 20;
const RAIA_W_MIN = 800;
const DESLOC_V = [0, -10, 10, -20, 20]; // setas que dividem um corredor ficam lado a lado
const DESLOC_H = [0, 6, -6, 12];

type Seta = { de: string; para: string; rotulo?: string; volta: boolean; i: number };
type Rota = { saida: 'direita' | 'baixo'; entrada: 'esquerda' | 'cima' | 'baixo'; pontos: [number, number][] };
type Anotacao = NonNullable<Fluxo['anotacoes']>[number];

// Início e fim mostram a palavra no círculo, como na biblioteca; o texto da IA vai embaixo.
const CIRCULO: Partial<Record<TipoNo, string>> = { inicio: 'Início', fim: 'Fim' };

const larguraRotulo = (rotulo: string) =>
  COR_INDICADOR[rotulo.toLowerCase()] ? Math.max(40, rotulo.length * 8 + 12) : Math.min(150, rotulo.length * 7 + 8);

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function agrupar<T>(itens: T[], chave: (x: T) => string) {
  const m = new Map<string, T[]>();
  for (const x of itens) m.set(chave(x), [...(m.get(chave(x)) ?? []), x]);
  return m;
}

export function gerarXml(fluxo: Fluxo): string {
  const raias = fluxo.raias.length ? fluxo.raias : [{ id: 'r1', area: 'Processo' }];
  const iRaia = new Map(raias.map((r, i) => [r.id, i]));
  const no = new Map<string, Fluxo['nos'][number]>();
  for (const n of fluxo.nos) if (!no.has(n.id)) no.set(n.id, n);
  const nos = [...no.values()];
  const raiaDe = (id: string) => iRaia.get(no.get(id)!.raia) ?? 0;
  // Eventos mostram o texto embaixo do círculo; início e fim só quando ele diz mais que "Início"/"Fim".
  const textoAbaixo = (id: string) => {
    const n = no.get(id)!, texto = n.texto.trim().toLowerCase();
    if (n.tipo === 'tarefa' || n.tipo.startsWith('gateway')) return false;
    return !!texto && texto !== CIRCULO[n.tipo]?.toLowerCase();
  };
  const setas: Seta[] = fluxo.conexoes
    .filter((c) => no.has(c.de) && no.has(c.para) && c.de !== c.para)
    .map((c, i) => ({ ...c, volta: false, i }));
  const saidas = agrupar(setas, (s) => s.de);
  const entradas = agrupar(setas, (s) => s.para);
  const anotacoes = agrupar((fluxo.anotacoes ?? []).filter((a) => no.has(a.no)), (a) => a.no);
  const ida = (id: string, m: Map<string, Seta[]>) => (m.get(id) ?? []).filter((s) => !s.volta);

  // 1. Laços: busca em profundidade a partir dos inícios; seta para um nó que ainda está na pilha é de volta.
  const estado = new Map<string, 'pilha' | 'feito'>();
  const visitar = (id: string) => {
    estado.set(id, 'pilha');
    for (const s of saidas.get(id) ?? []) {
      const e = estado.get(s.para);
      if (e === 'pilha') s.volta = true;
      else if (!e) visitar(s.para);
    }
    estado.set(id, 'feito');
  };
  const inicios = nos.filter((n) => n.tipo.startsWith('inicio') || !entradas.has(n.id));
  for (const n of [...inicios, ...nos]) if (!estado.has(n.id)) visitar(n.id);

  // 2. Colunas: maior distância desde o início, em ordem topológica (sem as setas de volta).
  const col = new Map(nos.map((n) => [n.id, 0]));
  const falta = new Map(nos.map((n) => [n.id, ida(n.id, entradas).length]));
  const ordem = nos.filter((n) => falta.get(n.id) === 0).map((n) => n.id);
  for (let k = 0; k < ordem.length; k++) {
    for (const s of ida(ordem[k], saidas)) {
      col.set(s.para, Math.max(col.get(s.para)!, col.get(ordem[k])! + 1));
      falta.set(s.para, falta.get(s.para)! - 1);
      if (falta.get(s.para) === 0) ordem.push(s.para);
    }
  }
  // Nó sem entrada (ex.: link vindo de outro processo) fica logo antes de quem ele alimenta.
  for (const n of nos) {
    const prox = ida(n.id, saidas);
    if (!ida(n.id, entradas).length && prox.length) col.set(n.id, Math.max(0, Math.min(...prox.map((s) => col.get(s.para)!)) - 1));
  }
  const maxCol = Math.max(0, ...col.values());

  // 3. Trilhas: cada nó vai para a primeira trilha livre a partir da trilha do antecessor na mesma raia.
  // A anotação reserva a célula logo abaixo do nó.
  const ocupado = new Set<string>();
  const ocupante = new Map<string, string>(); // célula → nó
  const cel = (r: number, c: number, t: number) => `${r}:${c}:${t}`;
  const trilha = new Map<string, number>();
  for (let c = 0; c <= maxCol; c++) {
    const daColuna = nos
      .filter((n) => col.get(n.id) === c)
      .map((n) => {
        const ant = ida(n.id, entradas).find((s) => raiaDe(s.de) === raiaDe(n.id));
        return { n, pref: ant ? trilha.get(ant.de) ?? 0 : 0, ordem: ant ? ant.i : Infinity };
      })
      .sort((a, b) => a.pref - b.pref || a.ordem - b.ordem);
    for (const { n, pref } of daColuna) {
      const r = raiaDe(n.id);
      const altura = 1 + (anotacoes.get(n.id)?.length ?? 0);
      let t = pref;
      while (Array.from({ length: altura }, (_, k) => cel(r, c, t + k)).some((k) => ocupado.has(k))) t++;
      for (let k = 0; k < altura; k++) ocupado.add(cel(r, c, t + k));
      ocupante.set(cel(r, c, t), n.id);
      trilha.set(n.id, t);
    }
  }

  // 4. Geometria.
  const trilhas = raias.map((_, r) =>
    Math.max(1, ...nos.filter((n) => raiaDe(n.id) === r).map((n) => trilha.get(n.id)! + 1 + (anotacoes.get(n.id)?.length ?? 0))),
  );
  const topo: number[] = [];
  const linhas: { r: number; t: number }[] = []; // todas as trilhas, de cima para baixo
  let yRaia = 0;
  raias.forEach((_, r) => {
    topo.push(yRaia);
    yRaia += RAIA_TOPO + trilhas[r] * TRILHA_H + RAIA_BASE;
    for (let t = 0; t < trilhas[r]; t++) linhas.push({ r, t });
  });
  const linhaGlobal = (r: number, t: number) => linhas.findIndex((l) => l.r === r && l.t === t);
  const folga = Array.from({ length: maxCol + 1 }, () => CORREDOR);
  for (const s of setas) {
    const rotulo = s.rotulo?.trim();
    if (rotulo && !COR_INDICADOR[rotulo.toLowerCase()]) folga[col.get(s.de)!] = Math.max(folga[col.get(s.de)!], larguraRotulo(rotulo) + 30);
  }
  const centros: number[] = [];
  for (let c = 0, x = ESQ + CORREDOR / 2 + NO_W / 2; c <= maxCol; x += NO_W + folga[c++]) centros.push(x);
  const largura = Math.max(RAIA_W_MIN, centros[maxCol] + NO_W / 2 + CORREDOR / 2 + ESQ);
  const cx = (c: number) => centros[c];
  const cyRel = (t: number) => RAIA_TOPO + t * TRILHA_H + NO_Y;
  const cy = (r: number, t: number) => topo[r] + cyRel(t);
  // Trecho vertical entre a coluna c e a c+1, a meio corredor padrão antes da próxima caixa.
  const corredorX = (c: number) => (c < 0 ? ESQ : cx(c) + NO_W / 2 + folga[c] - CORREDOR / 2);
  const canalY = (r: number, t: number) => topo[r] + RAIA_TOPO + t * TRILHA_H; // entre a trilha t-1 e a t

  // 5. Rotas das setas.
  const livreNaLinha = (r: number, t: number, c1: number, c2: number) => {
    for (let c = c1 + 1; c < c2; c++) if (ocupado.has(cel(r, c, t))) return false;
    return true;
  };
  const livreNaColuna = (c: number, g1: number, g2: number) => {
    for (let g = g1 + 1; g <= g2; g++) if (ocupado.has(cel(linhas[g].r, c, linhas[g].t))) return false;
    return true;
  };
  const vagas = new Map<string, number>();
  const uso = new Map<string, number>();
  const desloc = (faixa: string, dono: string, tabela: number[]) => {
    const k = `${faixa}|${dono}`;
    if (!vagas.has(k)) {
      const n = uso.get(faixa) ?? 0;
      vagas.set(k, tabela[n % tabela.length]);
      uso.set(faixa, n + 1);
    }
    return vagas.get(k)!;
  };

  function rota(s: Seta): Rota {
    const r = rotaBase(s);
    // Se outro nó está logo à esquerda do destino, a saída dele usa o mesmo trecho: entra por cima ou por baixo.
    const [rv, tv, cv] = [raiaDe(s.para), trilha.get(s.para)!, col.get(s.para)!];
    const vizinho = ocupante.get(cel(rv, cv - 1, tv));
    if (!r.pontos.length || !vizinho || vizinho === s.de) return r;
    const [x, yv] = r.pontos[r.pontos.length - 1];
    const yAntes = r.pontos.length > 1 ? r.pontos[r.pontos.length - 2][1] : cy(raiaDe(s.de), trilha.get(s.de)!);
    // Gateway tem a pergunta em cima; evento pode ter o texto embaixo.
    const porBaixo = no.get(s.para)!.tipo.startsWith('gateway') || (!textoAbaixo(s.para) && yAntes > yv);
    const y = canalY(rv, porBaixo ? tv + 1 : tv);
    return { ...r, entrada: porBaixo ? 'baixo' : 'cima', pontos: [...r.pontos.slice(0, -1), [x, y], [cx(cv), y]] };
  }

  function rotaBase(s: Seta): Rota {
    const [ru, rv, tu, tv, cu, cv] = [raiaDe(s.de), raiaDe(s.para), trilha.get(s.de)!, trilha.get(s.para)!, col.get(s.de)!, col.get(s.para)!];
    const xu = cx(cu), yu = cy(ru, tu), yv = cy(rv, tv);
    const gu = linhaGlobal(ru, tu), gv = linhaGlobal(rv, tv);
    // Saídas do mesmo nó (ou entradas no mesmo nó) dividem o trecho vertical, como um barramento.
    const variasSaidas = (saidas.get(s.de)?.length ?? 0) > 1, variasEntradas = (entradas.get(s.para)?.length ?? 0) > 1;
    const donoSaida = variasSaidas ? `de:${s.de}` : variasEntradas ? `para:${s.para}` : `s${s.i}`;
    const donoEntrada = variasEntradas ? `para:${s.para}` : variasSaidas ? `de:${s.de}` : `s${s.i}`;
    const vertical = (c: number, dono: string) => corredorX(c) + desloc(`v${c}`, dono, DESLOC_V);

    if (s.volta) {
      // Laço: desce até o corredor abaixo do nó, volta pela esquerda e entra no destino pelo lado.
      const y = canalY(ru, tu + 1) + desloc(`h${ru}:${tu + 1}`, donoSaida, DESLOC_H);
      const x = vertical(cv - 1, donoEntrada);
      return { saida: 'baixo', entrada: 'esquerda', pontos: [[xu, y], [x, y], [x, yv]] };
    }
    if (no.get(s.de)!.tipo.startsWith('gateway') && gv > gu && livreNaColuna(cu, gu, gv) && livreNaLinha(rv, tv, cu, cv))
      return { saida: 'baixo', entrada: 'esquerda', pontos: [[xu, yv]] };
    if (gu === gv && livreNaLinha(ru, tu, cu, cv)) return { saida: 'direita', entrada: 'esquerda', pontos: [] };
    if (cv === cu + 1) {
      const x = vertical(cu, donoSaida);
      return { saida: 'direita', entrada: 'esquerda', pontos: [[x, yu], [x, yv]] };
    }
    if (livreNaLinha(ru, tu, cu, cv)) {
      const x = vertical(cv - 1, donoEntrada);
      return { saida: 'direita', entrada: 'esquerda', pontos: [[x, yu], [x, yv]] };
    }
    if (livreNaLinha(rv, tv, cu, cv)) {
      const x = vertical(cu, donoSaida);
      return { saida: 'direita', entrada: 'esquerda', pontos: [[x, yu], [x, yv]] };
    }
    const t = gv > gu ? tu + 1 : tu;
    const y = canalY(ru, t) + desloc(`h${ru}:${t}`, donoSaida, DESLOC_H);
    const x1 = vertical(cu, donoSaida), x2 = vertical(cv - 1, donoEntrada);
    return { saida: 'direita', entrada: 'esquerda', pontos: [[x1, yu], [x1, y], [x2, y], [x2, yv]] };
  }

  // 6. XML.
  const celulas: string[] = [];
  raias.forEach((r, i) => {
    const altura = RAIA_TOPO + trilhas[i] * TRILHA_H + RAIA_BASE;
    const wNome = Math.min(200, Math.max(120, r.area.length * 8 + 24));
    const hNome = r.area.length * 8 + 24 > 200 ? 40 : 28;
    celulas.push(
      `<mxCell id="raia_${i}" value="" style="${ESTILO_RAIA}" vertex="1" parent="1"><mxGeometry x="0" y="${topo[i]}" width="${largura}" height="${altura}" as="geometry"/></mxCell>`,
      `<mxCell id="raia_${i}_nome" value="${esc(r.area)}" style="${ESTILO_RAIA_NOME}" vertex="1" parent="raia_${i}"><mxGeometry width="${wNome}" height="${hNome}" as="geometry"/></mxCell>`,
    );
  });

  for (const n of nos) {
    const e = ESTILO_NO[n.tipo];
    const texto = n.texto.trim();
    const id = `n_${esc(n.id)}`;
    const [c, t] = [col.get(n.id)!, trilha.get(n.id)!];
    const [x, y] = [cx(c) - e.w / 2, cyRel(t) - e.h / 2];
    // O texto embaixo do início/fim é filho do círculo: move junto quando a pessoa arrasta.
    const circulo = CIRCULO[n.tipo];
    celulas.push(
      `<mxCell id="${id}" value="${esc(circulo ?? texto)}" style="${e.estilo}" vertex="1" parent="raia_${raiaDe(n.id)}"><mxGeometry x="${x}" y="${y}" width="${e.w}" height="${e.h}" as="geometry"/></mxCell>`,
    );
    if (circulo && textoAbaixo(n.id))
      celulas.push(
        `<mxCell id="t_${esc(n.id)}" value="${esc(texto)}" style="${ESTILO_TEXTO_EVENTO}" vertex="1" parent="${id}"><mxGeometry x="${(e.w - 150) / 2}" y="${e.h + 3}" width="150" height="30" as="geometry"/></mxCell>`,
      );
  }

  for (const s of setas) {
    const { saida, entrada, pontos } = rota(s);
    const portas =
      (saida === 'baixo' ? 'exitX=0.5;exitY=1;' : 'exitX=1;exitY=0.5;') + 'exitDx=0;exitDy=0;' +
      (entrada === 'cima' ? 'entryX=0.5;entryY=0;' : entrada === 'baixo' ? 'entryX=0.5;entryY=1;' : 'entryX=0;entryY=0.5;') + 'entryDx=0;entryDy=0;';
    const pts = pontos.length ? `<Array as="points">${pontos.map(([x, y]) => `<mxPoint x="${x}" y="${y}"/>`).join('')}</Array>` : '';
    celulas.push(
      `<mxCell id="c_${s.i}" value="" style="${ESTILO_SETA}${portas}" edge="1" parent="1" source="n_${esc(s.de)}" target="n_${esc(s.para)}"><mxGeometry relative="1" as="geometry">${pts}</mxGeometry></mxCell>`,
    );
    const rotulo = s.rotulo?.trim();
    if (!rotulo) continue;
    // Rótulo preso à seta, logo depois da saída (x=-1 é o ponto de saída). Se a seta sobe ou desce logo
    // no corredor seguinte, o rótulo vai ao lado desse trecho, para não encostar no de outra saída pela direita.
    const cor = COR_INDICADOR[rotulo.toLowerCase()];
    const w = larguraRotulo(rotulo);
    const h = cor ? 22 : w >= 150 ? 34 : 18;
    const yu = cy(raiaDe(s.de), trilha.get(s.de)!);
    const xSaida = cx(col.get(s.de)!) + ESTILO_NO[no.get(s.de)!.tipo].w / 2;
    const vira = saida === 'direita' && pontos.length > 1 && pontos[0][1] === yu && pontos[1][1] !== yu && pontos[0][0] < cx(col.get(s.de)!) + NO_W / 2 + folga[col.get(s.de)!];
    const [dx, dy] = saida === 'baixo' ? [6, 4] : vira ? [pontos[0][0] - xSaida + 4, pontos[1][1] < yu ? -h - 34 : 34] : [4, -h - 4];
    celulas.push(
      `<mxCell id="c_${s.i}_rotulo" value="${esc(rotulo)}" style="${cor ? ESTILO_INDICADOR + `fillColor=${cor};` : ESTILO_ROTULO}" vertex="1" connectable="0" parent="c_${s.i}"><mxGeometry x="-1" width="${w}" height="${h}" relative="1" as="geometry"><mxPoint x="${dx}" y="${dy}" as="offset"/></mxGeometry></mxCell>`,
    );
  }

  // Anotações na célula reservada abaixo do nó, ligadas por linha tracejada (a linha fica atrás da caixa).
  let ia = 0;
  for (const [idNo, lista] of anotacoes) {
    const [r, c, t] = [raiaDe(idNo), col.get(idNo)!, trilha.get(idNo)!];
    lista.forEach((a: Anotacao, k) => {
      const linhasTexto = Math.ceil(a.texto.length / 26);
      const h = Math.min(TRILHA_H - 25, Math.max(40, linhasTexto * 15 + 12));
      const id = `a_${ia++}`;
      celulas.push(
        `<mxCell id="${id}_ligacao" style="${ESTILO_LIGACAO_NOTA}" edge="1" parent="raia_${r}" source="${id}" target="n_${esc(idNo)}"><mxGeometry relative="1" as="geometry"/></mxCell>`,
        `<mxCell id="${id}" value="${esc(a.texto)}" style="${a.tipo === 'alerta' ? ESTILO_ALERTA : ESTILO_NOTA}" vertex="1" parent="raia_${r}"><mxGeometry x="${cx(c) - 80}" y="${RAIA_TOPO + (t + 1 + k) * TRILHA_H + 15}" width="160" height="${h}" as="geometry"/></mxCell>`,
      );
    });
  }

  return `<mxGraphModel grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" page="0"><root><mxCell id="0"/><mxCell id="1" parent="0"/>${celulas.join('')}</root></mxGraphModel>`;
}
