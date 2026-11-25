// Ícone do processo (decisão 133): a pessoa escolhe um ícone do Lucide para cada processo, e ele aparece na pasta, na
// lista e ao lado do nome. O banco guarda o nome do ícone, a cor escolhida e o desenho (os nós do SVG, conferidos pelo
// servidor contra o catálogo), então mostrar o ícone não depende de carregar a biblioteca.

/** Um elemento do desenho: a marca do SVG (path, circle…) e os atributos dela. */
export type NoDoIcone = [string, Record<string, string>];
export type IconeDoProcesso = { nome: string; cor: number | null; nos: NoDoIcone[] };

// As 8 cores das pastas (decisão 61): fundo claro, o miolo do quadradinho de quem não tem ícone e, para o ícone, um tom
// escuro de cada uma (contraste de 4,2:1 ou mais sobre o fundo). Sem cor escolhida, a do processo sai do id e não muda.
export const CORES_DO_PROCESSO: readonly { nome: string; fundo: string; miolo: string; tinta: string }[] = [
  { nome: 'Rosa', fundo: '#fbe4ee', miolo: '#de7ba6', tinta: '#B4457A' },
  { nome: 'Verde', fundo: '#ddf3e9', miolo: '#4fb48a', tinta: '#25805B' },
  { nome: 'Amarelo', fundo: '#fcf0cf', miolo: '#d6a72c', tinta: '#8F6A0B' },
  { nome: 'Azul-claro', fundo: '#ddeffa', miolo: '#4ea4d4', tinta: '#22759F' },
  { nome: 'Lilás', fundo: '#ebe6fb', miolo: '#8f7ad6', tinta: '#6448BD' },
  { nome: 'Azul', fundo: '#e2e8fc', miolo: '#6f88e0', tinta: '#3F5BC4' },
  { nome: 'Pêssego', fundo: '#fde8da', miolo: '#de8f5c', tinta: '#A9572A' },
  { nome: 'Petróleo', fundo: '#dcefef', miolo: '#3f9ca3', tinta: '#257178' },
];

/** A cor que o processo tem sem ninguém escolher: sai do id. */
export function corPadrao(id: string) {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h % CORES_DO_PROCESSO.length;
}
export const indiceDaCor = (id: string, icone?: IconeDoProcesso | null) =>
  icone && icone.cor !== null && CORES_DO_PROCESSO[icone.cor] ? icone.cor : corPadrao(id);
export const coresDoProcesso = (id: string, icone?: IconeDoProcesso | null) => CORES_DO_PROCESSO[indiceDaCor(id, icone)];

// O catálogo que o seletor carrega ao abrir (GET /api/icones): todos os ícones do Lucide, com o nome e as palavras de
// busca em português e a categoria (lib/icones/pt.json).
export const CATEGORIAS_DE_ICONES = [
  'Pessoas e RH', 'Saúde e segurança', 'Financeiro', 'Documentos e arquivos', 'Jurídico e proteção', 'Compras e estoque',
  'Logística e transporte', 'Obras e manutenção', 'Imóveis e lugares', 'Comercial e atendimento', 'Comunicação', 'Tecnologia',
  'Gestão e indicadores', 'Tempo e agenda', 'Alimentação', 'Educação e ciência', 'Lazer, esporte e viagem', 'Natureza e clima',
  'Design, texto e mídia', 'Setas, formas e símbolos',
] as const;
/** [nome no Lucide, nome em português, palavras de busca, índice da categoria, desenho] */
export type ItemDoCatalogo = [string, string, string, number, NoDoIcone[]];
export type CatalogoDeIcones = { versao: string; categorias: readonly string[]; icones: ItemDoCatalogo[] };

export const semAcento = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
/** As palavras de um texto, sem acento, a partir de 3 letras. */
export const palavras = (t: string) => semAcento(t).split(/[^a-z0-9]+/).filter((p) => p.length >= 3);
/** Mesma palavra, uma começando pela outra (médico, médicos) ou com o mesmo começo longo (gerencial, gerenciais). */
export function palavraCasa(a: string, b: string) {
  if (a === b) return true;
  if (a.length < 4 || b.length < 4) return false;
  if (a.startsWith(b) || b.startsWith(a)) return true;
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return i >= 6 && i >= 0.85 * Math.min(a.length, b.length);
}

/** Um catálogo pronto para buscar: as palavras de cada ícone já separadas (as do nome em português à parte). */
export type IndiceDeIcones = { item: ItemDoCatalogo; chaves: string[]; doNome: string[] }[];
export const indexar = (c: CatalogoDeIcones): IndiceDeIcones =>
  c.icones.map((item) => ({ item, chaves: palavras(`${item[1]} ${item[2]} ${item[0]}`), doNome: palavras(item[1]) }));

// Categorias que mais aparecem em processos de empresa: nas sugestões, um ícone delas passa à frente de um de natureza,
// lazer ou formas com a mesma pontuação ("Folha de Pagamento" não deve sugerir uma folha de árvore).
const DE_NEGOCIO = new Set(['Pessoas e RH', 'Saúde e segurança', 'Financeiro', 'Documentos e arquivos', 'Jurídico e proteção', 'Compras e estoque',
  'Logística e transporte', 'Obras e manutenção', 'Imóveis e lugares', 'Comercial e atendimento', 'Gestão e indicadores', 'Tempo e agenda']
  .map((n) => (CATEGORIAS_DE_ICONES as readonly string[]).indexOf(n)));

/**
 * Sugestões pelo nome do processo. Vem primeiro o ícone que combina com mais palavras do nome; no empate, cada palavra
 * vale mais quando combina com poucos ícones ("odontológico" pesa mais que "plano"), vale mais quando está no nome do
 * ícone e não só nas palavras de busca, e os ícones das categorias de negócio têm preferência. Devolve até `max`.
 */
export function sugerirIcones(indice: IndiceDeIcones, nomeDoProcesso: string, max = 6): ItemDoCatalogo[] {
  const pontos = new Map<number, { casadas: number; valor: number }>();
  for (const p of new Set(palavras(nomeDoProcesso))) {
    const achados: number[] = [];
    indice.forEach((x, i) => { if (x.chaves.some((c) => palavraCasa(p, c))) achados.push(i); });
    const peso = 1 / Math.sqrt(achados.length);
    for (const i of achados) {
      const atual = pontos.get(i) ?? { casadas: 0, valor: 0 };
      pontos.set(i, { casadas: atual.casadas + 1, valor: atual.valor + (indice[i].doNome.some((c) => palavraCasa(p, c)) ? 1.5 * peso : peso) });
    }
  }
  const nota = (i: number, x: { valor: number }) => x.valor * (DE_NEGOCIO.has(indice[i].item[3]) ? 1.4 : 1);
  return [...pontos.entries()].sort((a, b) => b[1].casadas - a[1].casadas || nota(b[0], b[1]) - nota(a[0], a[1]) || a[0] - b[0]).slice(0, max).map(([i]) => indice[i].item);
}

/** Busca por nome ou palavra-chave (todas as palavras digitadas têm de bater), dentro da categoria, se houver. */
export function buscarIcones(indice: IndiceDeIcones, termo: string, categoria: number | null): ItemDoCatalogo[] {
  const limpo = semAcento(termo).trim();
  const termos = limpo.split(/[^a-z0-9]+/).filter(Boolean);
  return indice
    .filter((x) => categoria === null || x.item[3] === categoria)
    .filter((x) => termos.every((t) => x.chaves.some((c) => c.startsWith(t) || palavraCasa(t, c))))
    .map((x) => x.item);
}
