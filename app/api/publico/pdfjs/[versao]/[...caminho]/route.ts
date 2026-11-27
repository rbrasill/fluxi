import { readFile } from 'node:fs/promises';
import path from 'node:path';
import pacote from 'pdfjs-dist/package.json';

// Arquivos de apoio do leitor de PDF (decisão 141): o "trabalhador" que lê o PDF fora da tela e o que ele precisa
// para alguns PDFs (decodificadores de imagem, fontes padrão e mapas de caracteres). Vêm do pacote pdfjs-dist, sem
// cópia no repositório. É público porque a página pública do POP também mostra PDF; não há dado nosso aqui.
// A versão no endereço é a do pacote: o navegador pode guardar a resposta para sempre.

export const dynamic = 'force-dynamic';
const RAIZ = () => path.join(process.cwd(), 'node_modules/pdfjs-dist');
const PASTAS: Record<string, string> = { build: 'legacy/build', wasm: 'wasm', standard_fonts: 'standard_fonts', cmaps: 'cmaps', iccs: 'iccs' };
const TIPOS: Record<string, string> = {
  mjs: 'text/javascript; charset=utf-8', js: 'text/javascript; charset=utf-8', wasm: 'application/wasm', bcmap: 'application/octet-stream',
  pfb: 'application/octet-stream', ttf: 'font/ttf', icc: 'application/vnd.iccprofile',
};
const nada = () => new Response('Não encontrado', { status: 404, headers: { 'Cache-Control': 'no-store' } });

export async function GET(_req: Request, { params }: { params: Promise<{ versao: string; caminho: string[] }> }) {
  const { versao, caminho } = await params;
  if (versao !== pacote.version || caminho.length !== 2) return nada();
  const [pasta, arquivo] = caminho;
  const extensao = arquivo.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase() ?? '';
  if (!PASTAS[pasta] || !TIPOS[extensao] || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(arquivo)) return nada();
  // Da pasta "build" só sai o trabalhador.
  if (pasta === 'build' && arquivo !== 'pdf.worker.min.mjs') return nada();
  try {
    const bytes = await readFile(path.join(RAIZ(), PASTAS[pasta], arquivo));
    return new Response(new Uint8Array(bytes), { headers: { 'Content-Type': TIPOS[extensao], 'Cache-Control': 'public, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff' } });
  } catch {
    return nada();
  }
}
