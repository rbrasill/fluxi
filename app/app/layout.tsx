import Image from 'next/image';
import Link from 'next/link';
import { Icone } from '@/components/Icone';
import { NavLink } from '@/components/NavLink';
import { RecolherMenu } from '@/components/RecolherMenu';
import { VoltarAoTopo } from '@/components/VoltarAoTopo';
import { CHAVE_MENU } from '@/lib/menu';

// Menu recolhido (escolha guardada no navegador): aplicado antes de a página aparecer.
const MENU_SALVO = `try{if(localStorage.getItem('${CHAVE_MENU}')==='1')document.documentElement.dataset.menu='recolhido'}catch(e){}`;

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="shell">
      <script dangerouslySetInnerHTML={{ __html: MENU_SALVO }} />
      <aside className="side">
        <Link href="/app/inicio" className="brand" title="Início">
          {/* Logo completo (símbolo + nome); no celular e com o menu recolhido, só o símbolo. */}
          <Image src="/logo-fluxi.png" alt="Fluxi" width={158} height={40} className="brand-logo" priority />
          <Image src="/logo-fluxi-marca.png" alt="Fluxi" width={36} height={36} className="brand-marca" priority />
        </Link>
        <nav className="nav" aria-label="Principal">
          <NavLink href="/app/inicio" titulo="Início"><Icone nome="inicio" /><span className="nav-texto">Início</span></NavLink>
          <NavLink href="/app/pops" titulo="POPs"><Icone nome="pop" /><span className="nav-texto">POPs</span></NavLink>
          <span className="nav-label">ESTRUTURA</span>
          <NavLink href="/app/organizacoes" tambem={["/app/areas", "/app/processos"]} titulo="Organizações"><Icone nome="empresa" /><span className="nav-texto">Organizações</span></NavLink>
          <span className="nav-label">CONTA</span>
          <a href="#" aria-disabled="true" title="Pessoas e acessos (em breve)"><Icone nome="areas" /><span className="nav-texto">Pessoas e acessos</span><span className="soon">EM BREVE</span></a>
        </nav>
        <RecolherMenu />
      </aside>
      <div className="main">{children}</div>
      <VoltarAoTopo />
    </div>
  );
}
