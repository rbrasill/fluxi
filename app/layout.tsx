import type { Metadata } from 'next';
import { Sora, Manrope } from 'next/font/google';
import './globals.css';

const sora = Sora({ subsets: ['latin'], variable: '--font-display', weight: ['500', '600', '700'] });
const manrope = Manrope({ subsets: ['latin'], variable: '--font-body' });

export const metadata: Metadata = {
  title: 'Fluxi',
  description: 'Mapeamento de processos com fluxogramas BPMN e POPs.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${sora.variable} ${manrope.variable}`}>
      <body>{children}</body>
    </html>
  );
}
