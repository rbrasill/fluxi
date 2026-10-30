import Image from 'next/image';
import Link from 'next/link';
import { Icone } from '@/components/Icone';
import { NavLink } from '@/components/NavLink';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="shell">
      <aside className="side">
        <Link href="/app/inicio" className="brand">
          <Image src="/logo-fluxi.png" alt="" width={44} height={44} className="brand-logo" priority />
          <span className="brand-name">Fluxi</span>
        </Link>
        <nav className="nav" aria-label="Principal">
          <NavLink href="/app/inicio"><Icone nome="inicio" />Início</NavLink>
          <NavLink href="/app/pops"><Icone nome="pop" />POPs</NavLink>
          <span className="nav-label">ESTRUTURA</span>
          <NavLink href="/app/organizacoes" tambem={["/app/areas", "/app/processos"]}><Icone nome="empresa" />Organizações</NavLink>
          <span className="nav-label">MATERIAIS DE APOIO</span>
          <NavLink href="/app/gravacoes"><Icone nome="tela" />Gravações</NavLink>
          <NavLink href="/app/fluxogramas"><Icone nome="fluxo" />Fluxogramas</NavLink>
          <span className="nav-label">CONTA</span>
          <a href="#" aria-disabled="true"><Icone nome="areas" />Pessoas e acessos<span className="soon">EM BREVE</span></a>
        </nav>
      </aside>
      <div className="main">{children}</div>
    </div>
  );
}
