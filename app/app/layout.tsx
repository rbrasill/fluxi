import Image from 'next/image';
import Link from 'next/link';
import { ContaMenu } from '@/components/ContaMenu';
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
        <div className="side-topo">
          <Link href="/app/inicio" className="brand" title="Início">
            {/* Logo completo (símbolo + nome escuro, para o menu claro); no celular e com o menu recolhido, só o símbolo. */}
            <Image src="/logo-incflow-escuro.png" alt="INCFlow" width={161} height={26} className="brand-logo" priority />
            <Image src="/logo-incflow-marca.png" alt="INCFlow" width={36} height={36} className="brand-marca" priority />
          </Link>
          <RecolherMenu />
        </div>
        <nav className="nav" aria-label="Principal">
          <NavLink href="/app/inicio" titulo="Início"><Icone nome="inicio" /><span className="nav-texto">Início</span></NavLink>
          <NavLink href="/app/areas" tambem={["/app/processos", "/app/pops", "/app/fluxogramas", "/app/gravacoes"]} titulo="Áreas"><Icone nome="areas" /><span className="nav-texto">Áreas</span></NavLink>
          <span className="nav-label">ESTRUTURA</span>
          <NavLink href="/app/organizacoes" titulo="Organizações"><Icone nome="empresa" /><span className="nav-texto">Organizações</span></NavLink>
          <span className="nav-label">LABORATÓRIO</span>
          <NavLink href="/app/entrevistas" titulo="Conversas com a Maia"><Icone nome="microfone" /><span className="nav-texto">Conversas com a Maia</span></NavLink>
          <span className="nav-label">CONTA</span>
          <ContaMenu />
        </nav>
      </aside>
      <div className="main">{children}</div>
      <VoltarAoTopo />
    </div>
  );
}
