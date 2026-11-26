import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // O pdfmake é carregado como pacote do Node (não entra no bundle).
  serverExternalPackages: ['pdfmake'],
  // As fontes, a logo e o padrão do documento do POP são lidos do disco na geração do PDF: incluir no pacote de
  // cada função que gera PDF (o POP no editor, numa versão e na página pública, e as regras do processo).
  outputFileTracingIncludes: {
    ...Object.fromEntries(
      ['/api/pops/[id]/pdf', '/api/pops/[id]/versoes/[versao]/pdf', '/api/publico/pops/[link]/pdf', '/api/processos/[id]/regras/pdf']
        .map((rota) => [rota, ['./templates/pop/fontes/*.ttf', './templates/pop/imagens/*']]),
    ),
    // O leitor de PDF dos arquivos do POP (decisão 141): a rota serve estes arquivos do pacote pdfjs-dist.
    '/api/publico/pdfjs/[versao]/[...caminho]': [
      './node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs', './node_modules/pdfjs-dist/wasm/*', './node_modules/pdfjs-dist/standard_fonts/*',
      './node_modules/pdfjs-dist/cmaps/*', './node_modules/pdfjs-dist/iccs/*',
    ],
  },
};

export default nextConfig;
