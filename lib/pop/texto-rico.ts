// Texto com formatação do POP (objetivo e passos). Fica no mesmo campo de texto, como um HTML
// restrito gerado pelo editor (docs/decisoes.md, decisão 29):
//   <p>, <ul>/<ol> com <li>, <table> com <tr> e <th>/<td>, <br>, <strong>, <em>, <u>, <s>,
//   <span style="color: #rrggbb"> (cor do texto) e <mark data-color="#rrggbb"> (marca-texto).
// Células mescladas não existem: colspan/rowspan são ignorados (cada célula conta uma).
// Texto sem HTML (o que a IA escreve e os POPs antigos) continua valendo: cada linha é um parágrafo.
// Este arquivo não depende do navegador: o DOCX e o PDF leem o mesmo formato no servidor.

export type Trecho = {
  texto: string; // pode ter "\n" (quebra de linha dentro do parágrafo)
  negrito?: boolean;
  italico?: boolean;
  sublinhado?: boolean;
  tachado?: boolean;
  cor?: string; // #rrggbb
  fundo?: string; // #rrggbb (marca-texto)
};
export type Celula = { cabecalho: boolean; blocos: Bloco[] };
export type Bloco =
  | { tipo: 'paragrafo'; trechos: Trecho[] }
  | { tipo: 'lista'; ordenada: boolean; itens: Bloco[][] }
  | { tipo: 'tabela'; linhas: Celula[][] };

/** Número de colunas da tabela (a linha mais longa; as outras completam com células vazias). */
export const colunas = (t: Extract<Bloco, { tipo: 'tabela' }>) => Math.max(1, ...t.linhas.map((l) => l.length));
/** Linhas de cabeçalho no topo (todas as células são <th>): repetem no topo de cada página. */
export const linhasDeCabecalho = (t: Extract<Bloco, { tipo: 'tabela' }>) => {
  let n = 0;
  while (n < t.linhas.length && t.linhas[n].length && t.linhas[n].every((c) => c.cabecalho)) n++;
  return n;
};

/** Cores oferecidas no editor (as mesmas saem no DOCX e no PDF). */
export const CORES_TEXTO = [
  { nome: 'Vermelho', cor: '#C0392B' },
  { nome: 'Laranja', cor: '#D35400' },
  { nome: 'Verde', cor: '#1E8449' },
  { nome: 'Azul', cor: '#1F4E79' },
  { nome: 'Roxo', cor: '#7D3C98' },
  { nome: 'Cinza', cor: '#7F7F7F' },
] as const;
export const CORES_MARCA_TEXTO = [
  { nome: 'Amarelo', cor: '#FFF59D' },
  { nome: 'Verde', cor: '#C8E6C9' },
  { nome: 'Azul', cor: '#BBDEFB' },
  { nome: 'Rosa', cor: '#F8BBD0' },
  { nome: 'Laranja', cor: '#FFE0B2' },
] as const;

/** O valor está no formato do editor (HTML) e não em texto simples? */
export const ehRico = (valor: string) => /^\s*<(p|ul|ol|table)[\s>]/i.test(valor);

const ENTIDADES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
function decodificar(s: string) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m;
    }
    return ENTIDADES[e.toLowerCase()] ?? m;
  });
}

/** Aceita só cores #rrggbb (ou rgb(), que alguns navegadores devolvem); qualquer outra coisa é ignorada. */
function corValida(v: string | undefined) {
  if (!v) return undefined;
  const s = v.trim();
  const hex = s.match(/^#([0-9a-f]{6})$/i);
  if (hex) return `#${hex[1].toUpperCase()}`;
  const curto = s.match(/^#([0-9a-f])([0-9a-f])([0-9a-f])$/i);
  if (curto) return `#${curto[1]}${curto[1]}${curto[2]}${curto[2]}${curto[3]}${curto[3]}`.toUpperCase();
  const rgb = s.match(/^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/i);
  if (rgb) return `#${rgb.slice(1, 4).map((n) => Math.min(255, Number(n)).toString(16).padStart(2, '0')).join('').toUpperCase()}`;
  return undefined;
}
const atributo = (attrs: string, nome: string) => attrs.match(new RegExp(`${nome}\\s*=\\s*("([^"]*)"|'([^']*)')`, 'i'))?.slice(2).find((x) => x !== undefined);
const estilo = (attrs: string, prop: string) => decodificar(atributo(attrs, 'style') ?? '').match(new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([^;]+)`, 'i'))?.[1];

type Marcas = Omit<Trecho, 'texto'>;
type Lista = Extract<Bloco, { tipo: 'lista' }>;
type Tabela = Extract<Bloco, { tipo: 'tabela' }>;
type Quadro = { lista: Lista } | { tabela: Tabela };

/**
 * Lê o valor do campo em blocos (parágrafos e listas). HTML fora do formato vira texto: tags
 * desconhecidas são ignoradas (o conteúdo fica), atributos que não são cor também.
 */
export function lerTexto(valor: string | null | undefined): Bloco[] {
  const v = valor ?? '';
  if (!ehRico(v)) {
    return v.split(/\r?\n/).map((linha) => ({ tipo: 'paragrafo' as const, trechos: linha ? [{ texto: linha }] : [] }));
  }

  const raiz: Bloco[] = [];
  const quadros: Quadro[] = []; // listas e tabelas abertas (uma dentro da outra)
  const marcas: { tag: string; m: Marcas }[] = [];
  let paragrafo: Trecho[] | null = null;

  // Onde entram os blocos agora: no item da lista ou na célula da tabela mais interna, ou na raiz.
  const destino = (): Bloco[] => {
    const q = quadros.at(-1);
    if (!q) return raiz;
    if ('lista' in q) {
      if (!q.lista.itens.length) q.lista.itens.push([]);
      return q.lista.itens.at(-1)!;
    }
    if (!q.tabela.linhas.length) q.tabela.linhas.push([]);
    const linha = q.tabela.linhas.at(-1)!;
    if (!linha.length) linha.push({ cabecalho: false, blocos: [] });
    return linha.at(-1)!.blocos;
  };
  /** Fecha o que estiver aberto até a tabela mais interna (HTML colado pode não fechar as listas). */
  const ateTabela = () => {
    const i = quadros.map((q) => 'tabela' in q).lastIndexOf(true);
    if (i < 0) return null;
    quadros.length = i + 1;
    return (quadros[i] as { tabela: Tabela }).tabela;
  };
  const fecharParagrafo = () => {
    if (paragrafo) destino().push({ tipo: 'paragrafo', trechos: paragrafo });
    paragrafo = null;
  };
  const atual = () => Object.assign({}, ...marcas.map((x) => x.m)) as Marcas;
  const escrever = (texto: string) => {
    if (!texto) return;
    paragrafo ??= [];
    const m = atual();
    const ultimo = paragrafo.at(-1);
    const igual = ultimo && (['negrito', 'italico', 'sublinhado', 'tachado', 'cor', 'fundo'] as const).every((k) => ultimo[k] === m[k]);
    if (igual) ultimo.texto += texto;
    else paragrafo.push({ texto, ...m });
  };

  const partes = v.split(/(<[^>]*>)/);
  for (const parte of partes) {
    if (!parte) continue;
    const tag = parte.match(/^<\s*(\/?)\s*([a-z0-9]+)([^>]*)>$/i);
    if (!tag) {
      // Espaços em branco entre blocos (quebras de linha do HTML) não são texto.
      if (!paragrafo && !parte.trim()) continue;
      escrever(decodificar(parte).replace(/[\r\n\t]+/g, ' '));
      continue;
    }
    const [, barra, nomeBruto, attrs] = tag;
    const nome = nomeBruto.toLowerCase();
    const fecha = barra === '/';
    switch (nome) {
      case 'p':
        fecharParagrafo();
        if (!fecha) paragrafo = [];
        break;
      case 'br':
        escrever('\n');
        break;
      case 'ul':
      case 'ol': {
        fecharParagrafo();
        if (!fecha) {
          const lista: Lista = { tipo: 'lista', ordenada: nome === 'ol', itens: [] };
          destino().push(lista);
          quadros.push({ lista });
        } else {
          const i = quadros.map((q) => 'lista' in q).lastIndexOf(true);
          if (i >= 0) quadros.length = i;
        }
        break;
      }
      case 'li': {
        fecharParagrafo();
        const q = quadros.at(-1);
        if (!fecha && q && 'lista' in q) q.lista.itens.push([]);
        break;
      }
      case 'table':
        fecharParagrafo();
        if (!fecha) {
          const tabela: Tabela = { tipo: 'tabela', linhas: [] };
          destino().push(tabela);
          quadros.push({ tabela });
        } else if (ateTabela()) {
          quadros.pop();
        }
        break;
      case 'tr':
        fecharParagrafo();
        if (!fecha) ateTabela()?.linhas.push([]);
        break;
      case 'td':
      case 'th': {
        fecharParagrafo();
        const tabela = fecha ? null : ateTabela();
        if (tabela) {
          if (!tabela.linhas.length) tabela.linhas.push([]);
          tabela.linhas.at(-1)!.push({ cabecalho: nome === 'th', blocos: [] });
        }
        break;
      }
      case 'thead': case 'tbody': case 'tfoot': case 'colgroup': case 'col':
        break; // estrutura da tabela sem efeito no conteúdo
      default: {
        const m: Marcas | null =
          nome === 'strong' || nome === 'b' ? { negrito: true }
            : nome === 'em' || nome === 'i' ? { italico: true }
              : nome === 'u' ? { sublinhado: true }
                : nome === 's' || nome === 'strike' || nome === 'del' ? { tachado: true }
                  : nome === 'span' ? { cor: corValida(estilo(attrs, 'color')) }
                    : nome === 'mark' ? { fundo: corValida(atributo(attrs, 'data-color') ?? estilo(attrs, 'background-color')) ?? '#FFF59D' }
                      : null;
        if (!m) break; // tag desconhecida: só o conteúdo
        if (fecha) {
          const i = marcas.map((x) => x.tag).lastIndexOf(nome);
          if (i >= 0) marcas.splice(i, 1);
        } else if (!/\/\s*$/.test(attrs)) {
          for (const k of Object.keys(m) as (keyof Marcas)[]) if (m[k] === undefined) delete m[k];
          marcas.push({ tag: nome, m });
        }
      }
    }
  }
  fecharParagrafo();
  return raiz;
}

/** Só o texto, sem formatação (para saber se está vazio, buscar, mostrar em listas). */
export function textoPuro(valor: string | null | undefined): string {
  const linhas: string[] = [];
  const percorrer = (blocos: Bloco[]) => {
    for (const b of blocos) {
      if (b.tipo === 'paragrafo') linhas.push(b.trechos.map((t) => t.texto).join(''));
      else if (b.tipo === 'lista') b.itens.forEach(percorrer);
      else b.linhas.forEach((l) => l.forEach((c) => percorrer(c.blocos)));
    }
  };
  percorrer(lerTexto(valor));
  return linhas.join('\n').trim();
}

const escapar = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** HTML para abrir no editor: o texto simples vira um parágrafo por linha. */
export function paraEditor(valor: string | null | undefined): string {
  const v = valor ?? '';
  if (ehRico(v)) return v;
  return v.split(/\r?\n/).map((l) => `<p>${escapar(l)}</p>`).join('');
}

/** HTML no formato do editor a partir dos blocos (só as tags e atributos permitidos, texto escapado). */
export function paraHtml(blocos: Bloco[]): string {
  const trecho = (t: Trecho) => {
    let h = escapar(t.texto).replace(/\n/g, '<br>');
    if (t.negrito) h = `<strong>${h}</strong>`;
    if (t.italico) h = `<em>${h}</em>`;
    if (t.sublinhado) h = `<u>${h}</u>`;
    if (t.tachado) h = `<s>${h}</s>`;
    if (t.fundo) h = `<mark data-color="${t.fundo}" style="background-color: ${t.fundo}; color: inherit">${h}</mark>`;
    if (t.cor) h = `<span style="color: ${t.cor}">${h}</span>`;
    return h;
  };
  const blocos_ = (lista: Bloco[]): string => lista.map((b) => {
    if (b.tipo === 'paragrafo') return `<p>${b.trechos.map(trecho).join('')}</p>`;
    if (b.tipo === 'lista') {
      const tag = b.ordenada ? 'ol' : 'ul';
      return `<${tag}>${b.itens.map((item) => `<li>${blocos_(item) || '<p></p>'}</li>`).join('')}</${tag}>`;
    }
    const n = colunas(b);
    const linhas = b.linhas.map((l) => `<tr>${Array.from({ length: n }, (_, k) => l[k] ?? { cabecalho: false, blocos: [] })
      .map((c) => { const tag = c.cabecalho ? 'th' : 'td'; return `<${tag}>${blocos_(c.blocos) || '<p></p>'}</${tag}>`; }).join('')}</tr>`);
    return `<table><tbody>${linhas.join('')}</tbody></table>`;
  }).join('');
  return blocos_(blocos);
}

/** Passa qualquer texto (simples ou HTML de fora, como o da IA) pelo formato do editor: o que não é permitido sai. */
export const normalizarHtml = (valor: string | null | undefined) => paraHtml(lerTexto(paraEditor(valor)));

/** O editor vazio (só parágrafos sem texto) volta como texto vazio, para os filtros de "passo vazio". */
export const normalizarDoEditor = (html: string) => (textoPuro(html) ? html : '');
