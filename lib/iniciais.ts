// Iniciais para avatares (redesign, decisões 77 e 82).

const LIGACOES = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'a', 'o', 'em', 'para']);
const palavrasDe = (nome: string) => nome.trim().split(/\s+/).filter(Boolean);

/** Iniciais de uma pessoa: a primeira letra do primeiro e do último nome ("Gloria Regina dos Santos Soares" → GS). */
export function iniciais(nome: string): string {
  const palavras = palavrasDe(nome);
  if (!palavras.length) return '?';
  const letras = palavras.length === 1 ? palavras[0].slice(0, 2) : palavras[0][0] + palavras[palavras.length - 1][0];
  return letras.toUpperCase();
}

/**
 * Sigla de uma organização, área ou processo: a primeira palavra quando ela já é uma sigla curta em maiúsculas
 * ("INC", "SST"); senão, a primeira letra das duas primeiras palavras, pulando "de", "da", "e"…
 * ("Baú da Felicidade" → BF, "Governança e Gestão ADM" → GG).
 */
export function sigla(nome: string): string {
  const palavras = palavrasDe(nome);
  if (!palavras.length) return '?';
  const primeira = palavras[0];
  if (primeira.length >= 2 && primeira.length <= 4 && primeira === primeira.toUpperCase() && /^[A-ZÀ-Ú0-9]+$/.test(primeira)) return primeira;
  const fortes = palavras.filter((p) => !LIGACOES.has(p.toLowerCase()));
  const base = fortes.length ? fortes : palavras;
  return (base.length === 1 ? base[0].slice(0, 2) : base[0][0] + base[1][0]).toUpperCase();
}

/** Cor do avatar em rodízio (decisão 75): fundo claro e texto escuro da mesma família, sempre a mesma para o mesmo nome. */
export const CORES_AVATAR = ['indigo', 'teal', 'verde', 'rosa', 'pessego'] as const;
export function corDoAvatar(chave: string): (typeof CORES_AVATAR)[number] {
  let soma = 0;
  for (const c of chave) soma = (soma * 31 + c.charCodeAt(0)) >>> 0;
  return CORES_AVATAR[soma % CORES_AVATAR.length];
}
