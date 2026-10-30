// Confere se a revisão da IA manteve o que não pode mudar (decisão 30). Os modelos às vezes erram
// mesmo instruídos: num teste real, "Fluig" virou "FluFlig". Devolve o que foi alterado (vazio = ok).
//  - links, textos entre aspas, códigos com números (S-2220, B31, NR-7), palavras em MAIÚSCULAS e
//    com maiúscula no meio (eSocial) precisam continuar no texto;
//  - esses termos e os nomes com inicial maiúscula no meio da frase (Fluig, Agidesk, Salvar) não
//    podem aparecer deformados: palavra nova parecida com um deles (uma letra trocada, letras a mais
//    ou a menos). Acento corrigido e plural não contam.

const BORDA_ANTES = '(?<![\\p{L}\\d])';
const BORDA_DEPOIS = '(?![\\p{L}\\d])';
const escapar = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// "ASO" continua presente em "ASOs": plural não conta como mudança.
const presente = (texto: string, termo: string) => new RegExp(`${BORDA_ANTES}${escapar(termo)}s?${BORDA_DEPOIS}`, 'u').test(texto);
const semAcento = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '');
const soNumero = (s: string) => /^\d+$/.test(s);

const MARCADOS = [
  `(?:[\\p{L}\\d]+[-./])*[\\p{L}\\d]*\\d[\\p{L}\\d]*(?:[-./][\\p{L}\\d]+)*`, // com número: S-2220, B31, NR-7
  `\\p{Lu}{2,}`, // MAIÚSCULAS: RM, ASO, NOME
  `\\p{Ll}+\\p{Lu}\\p{L}*`, // maiúscula no meio: eSocial
].map((r) => new RegExp(BORDA_ANTES + r + BORDA_DEPOIS, 'gu'));
const marcados = (t: string) => MARCADOS.flatMap((r) => t.match(r) ?? []);
// Inicial maiúscula logo depois de uma palavra minúscula: nome de sistema, tela, botão ("no Fluig").
const nomesNoMeio = (t: string) => t.match(/(?<=\p{Ll},?\s)\p{Lu}[\p{L}\d]{2,}/gu) ?? [];

function distancia(a: string, b: string) {
  const d = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let anterior = d[0];
    d[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const guardado = d[j];
      d[j] = Math.min(d[j] + 1, d[j - 1] + 1, anterior + (a[i - 1] === b[j - 1] ? 0 : 1));
      anterior = guardado;
    }
  }
  return d[b.length];
}

/** `curta` cabe dentro de `longa` na mesma ordem (letras inseridas no meio, como em "FluFlig"). */
function subsequencia(curta: string, longa: string) {
  let i = 0;
  for (const c of longa) if (c === curta[i]) i++;
  return i === curta.length;
}

function parecida(nova: string, termo: string) {
  const a = semAcento(nova.toLowerCase()), b = semAcento(termo.toLowerCase());
  if (a === b || a === `${b}s` || b === `${a}s` || a[0] !== b[0]) return false;
  if (distancia(a, b) <= (b.length >= 6 ? 2 : 1)) return true;
  // letras a mais ou a menos (até 3), mantendo a ordem
  return Math.abs(a.length - b.length) <= 3 && (a.length > b.length ? subsequencia(b, a) : subsequencia(a, b));
}

export function termosAlterados(antes: string, depois: string): string[] {
  const deformados = new Map<string, string>();
  const termos = new Set([...nomesNoMeio(antes), ...marcados(antes)].filter((t) => t.length >= 3 && !soNumero(t)));
  const conhecidas = new Set([...(antes.match(/[\p{L}\d]+/gu) ?? []), ...marcados(antes)]);
  for (const nova of new Set([...nomesNoMeio(depois), ...marcados(depois)])) {
    if (conhecidas.has(nova) || soNumero(nova)) continue;
    for (const t of termos) if (!deformados.has(t) && parecida(nova, t)) deformados.set(t, nova);
  }

  const sumidos = new Set([
    ...(antes.match(/https?:\/\/[^\s<>"“”]+/g) ?? []),
    ...[...antes.matchAll(/[“"]([^”"\n]{2,80})[”"]/g)].map((m) => m[1].trim()),
    ...marcados(antes),
  ].filter((t) => {
    // Números curtos são itens ("1.", "2 -") ou marcas do print: a numeração fica a cargo do prompt.
    if (!t || (soNumero(t) && t.length <= 2) || deformados.has(t)) return false;
    return !(/^https?:|\s/.test(t) ? depois.includes(t) : presente(depois, t));
  }));

  return [...[...deformados].map(([t, nova]) => `“${t}” virou “${nova}”`), ...[...sumidos].map((t) => `“${t}” sumiu`)];
}
