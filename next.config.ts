import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // O pdfmake é carregado como pacote do Node (não entra no bundle).
  serverExternalPackages: ['pdfmake'],
  // Fontes e imagens do modelo do POP são lidas do disco na geração do PDF: incluir no pacote das funções.
  outputFileTracingIncludes: {
    '/api/pops/[id]/pdf': ['./templates/pop/fontes/*.ttf', './templates/pop/imagens/*.png'],
  },
};

export default nextConfig;
