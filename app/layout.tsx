import type { Metadata } from 'next';
import localFont from 'next/font/local';
import { Dialogos } from '@/components/Dialogos';
import './globals.css';

// Fonte guardada no projeto (app/fontes, licença OFL): antes vinha do Google na hora do build, e o Turbopack às
// vezes não conseguia ler o endereço devolvido, o que derrubava o deploy na Vercel. Plus Jakarta Sans em toda a
// plataforma (decisão 71): títulos, texto e, no peso Light (300), as descrições; com o itálico de verdade.
const jakarta = localFont({
  src: [
    { path: './fontes/plus-jakarta-sans-latin-wght-normal.woff2', weight: '200 800', style: 'normal' },
    { path: './fontes/plus-jakarta-sans-latin-wght-italic.woff2', weight: '200 800', style: 'italic' },
  ],
  variable: '--font-body', display: 'swap',
});

export const metadata: Metadata = {
  title: 'INCFlow',
  description: 'Mapeamento de processos com fluxogramas BPMN e POPs.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // suppressHydrationWarning: o script do menu recolhido marca o <html> antes de o React assumir.
    <html lang="pt-BR" className={jakarta.variable} suppressHydrationWarning>
      <body>{children}<Dialogos /></body>
    </html>
  );
}
