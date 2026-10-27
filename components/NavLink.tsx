'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

/** Link do menu lateral; fica marcado também nas rotas de `tambem` (ex.: telas filhas da mesma seção). */
export function NavLink({ href, tambem = [], children }: { href: string; tambem?: string[]; children: React.ReactNode }) {
  const rota = usePathname() ?? '';
  const atual = [href, ...tambem].some((r) => rota.startsWith(r));
  return (
    <Link href={href} aria-current={atual ? 'page' : undefined}>
      {children}
    </Link>
  );
}
