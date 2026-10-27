import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // O pdfmake é carregado como pacote do Node (não entra no bundle).
  serverExternalPackages: ['pdfmake'],
  // Modelo, fontes e imagens do POP são lidos do disco na geração: incluir no pacote das funções.
  outputFileTracingIncludes: {
    '/api/pops/[id]/docx': ['./templates/pop/modelo-pop-v3.template.docx'],
    '/api/pops/[id]/pdf': ['./templates/pop/fontes/*.ttf', './templates/pop/imagens/*.png'],
  },
};

export default nextConfig;
