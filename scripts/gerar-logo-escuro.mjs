// Gera public/logo-incflow-escuro.png a partir de public/logo-incflow.png: o mesmo logo, com o nome "INCFlow" na
// cor do texto do app em vez de branco, para fundos claros (o cartão do login, decisão 73). O símbolo colorido
// fica como está. Uso: node scripts/gerar-logo-escuro.mjs
import sharp from 'sharp';

const TINTA = [14, 26, 31]; // --ink
const { data, info } = await sharp('public/logo-incflow.png').ensureAlpha().raw().toBuffer({ resolveWithObject: true });
let trocados = 0;
for (let i = 0; i < data.length; i += 4) {
  const [r, g, b, a] = [data[i], data[i + 1], data[i + 2], data[i + 3]];
  // O nome é branco puro (com as bordas suavizadas só no alfa); o símbolo é roxo, rosa e laranja.
  if (a > 0 && r > 215 && g > 215 && b > 215) { data[i] = TINTA[0]; data[i + 1] = TINTA[1]; data[i + 2] = TINTA[2]; trocados++; }
}
await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).png({ compressionLevel: 9 }).toFile('public/logo-incflow-escuro.png');
console.log(`logo-incflow-escuro.png: ${info.width}x${info.height}, ${trocados} pixels do nome recoloridos`);
