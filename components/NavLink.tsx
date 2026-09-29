'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  const atual = usePathname()?.startsWith(href);
  return (
    <Link href={href} aria-current={atual ? 'page' : undefined}>
      {children}
    </Link>
  );
}
