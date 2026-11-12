// Iniciais para avatares (redesign, decisão 77): a primeira letra das duas primeiras palavras do nome.
export function iniciais(nome: string): string {
  const palavras = nome.trim().split(/\s+/).filter(Boolean);
  if (!palavras.length) return '?';
  const letras = palavras.length === 1 ? palavras[0].slice(0, 2) : palavras[0][0] + palavras[1][0];
  return letras.toUpperCase();
}

/** Cor do avatar em rodízio (decisão 75): fundo claro e texto escuro da mesma família, sempre a mesma para o mesmo nome. */
export const CORES_AVATAR = ['indigo', 'teal', 'verde', 'rosa', 'pessego'] as const;
export function corDoAvatar(chave: string): (typeof CORES_AVATAR)[number] {
  let soma = 0;
  for (const c of chave) soma = (soma * 31 + c.charCodeAt(0)) >>> 0;
  return CORES_AVATAR[soma % CORES_AVATAR.length];
}
