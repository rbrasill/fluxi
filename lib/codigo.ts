// Código do processo: 8 caracteres no formato XXXX-XXXX, sem caracteres ambíguos (0/O, 1/I/L).
const ALFABETO = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

export function gerarCodigo(): string {
  const bytes = new Uint32Array(8);
  crypto.getRandomValues(bytes);
  const c = Array.from(bytes, (b) => ALFABETO[b % ALFABETO.length]).join('');
  return `${c.slice(0, 4)}-${c.slice(4)}`;
}
