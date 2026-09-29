import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // O modelo do POP é lido do disco na geração do DOCX: incluir no pacote da função.
  outputFileTracingIncludes: {
    '/api/pops/[id]/docx': ['./templates/pop/modelo-pop-v3.template.docx'],
  },
};

export default nextConfig;
