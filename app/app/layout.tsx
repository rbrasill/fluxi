import Link from 'next/link';
import { Icone } from '@/components/Icone';
import { NavLink } from '@/components/NavLink';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="shell">
      <aside className="side">
        <Link href="/app/fluxogramas" className="brand">
          <span className="brand-mark"><Icone nome="fluxo" tamanho={20} /></span>
          <span className="brand-name">Fluxi</span>
        </Link>
        <nav className="nav" aria-label="Principal">
          <span className="nav-label">GERAL</span>
          <NavLink href="/app/fluxogramas"><Icone nome="fluxo" />Fluxogramas</NavLink>
          <a href="#" aria-disabled="true"><Icone nome="processos" />Processos<span className="soon">EM BREVE</span></a>
          <NavLink href="/app/gravacoes"><Icone nome="tela" />Gravações</NavLink>
          <a href="#" aria-disabled="true"><Icone nome="pop" />POPs<span className="soon">EM BREVE</span></a>
          <span className="nav-label">ORGANIZAÇÃO</span>
          <a href="#" aria-disabled="true"><Icone nome="areas" />Áreas e cargos<span className="soon">EM BREVE</span></a>
        </nav>
      </aside>
      <div className="main">{children}</div>
    </div>
  );
}
