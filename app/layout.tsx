import type { Metadata } from 'next';
import localFont from 'next/font/local';
import { Dialogos } from '@/components/Dialogos';
import './globals.css';

// Fontes guardadas no projeto (app/fontes, licença OFL): antes vinham do Google na hora do build, e o
// Turbopack às vezes não conseguia ler o endereço devolvido, o que derrubava o deploy na Vercel.
const sora = localFont({ src: './fontes/sora-latin-wght-normal.woff2', variable: '--font-display', weight: '100 800', display: 'swap' });
const manrope = localFont({ src: './fontes/manrope-latin-wght-normal.woff2', variable: '--font-body', weight: '200 800', display: 'swap' });

export const metadata: Metadata = {
  title: 'INCFlow',
  description: 'Mapeamento de processos com fluxogramas BPMN e POPs.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // suppressHydrationWarning: o script do menu recolhido marca o <html> antes de o React assumir.
    <html lang="pt-BR" className={`${sora.variable} ${manrope.variable}`} suppressHydrationWarning>
      <body>{children}<Dialogos /></body>
    </html>
  );
}
