import type { Metadata } from 'next';

// Página pública por link (decisão 32): quem tem o link vê; buscadores não indexam.
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
