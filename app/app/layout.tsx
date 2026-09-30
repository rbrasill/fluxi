import Link from 'next/link';
import { Icone } from '@/components/Icone';
import { NavLink } from '@/components/NavLink';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="shell">
      <aside className="side">
        <Link href="/app/areas" className="brand">
          <span className="brand-mark"><Icone nome="fluxo" tamanho={20} /></span>
          <span className="brand-name">Fluxi</span>
        </Link>
        <nav className="nav" aria-label="Principal">
          <span className="nav-label">GERAL</span>
          <NavLink href="/app/areas"><Icone nome="areas" />Áreas</NavLink>
          <NavLink href="/app/processos"><Icone nome="pasta" />Todos os processos</NavLink>
          <span className="nav-label">TODOS OS ITENS</span>
          <NavLink href="/app/fluxogramas"><Icone nome="fluxo" />Fluxogramas</NavLink>
          <NavLink href="/app/gravacoes"><Icone nome="tela" />Gravações</NavLink>
          <NavLink href="/app/pops"><Icone nome="pop" />POPs</NavLink>
          <span className="nav-label">ORGANIZAÇÃO</span>
          <a href="#" aria-disabled="true"><Icone nome="areas" />Pessoas e acessos<span className="soon">EM BREVE</span></a>
        </nav>
      </aside>
      <div className="main">{children}</div>
    </div>
  );
}
