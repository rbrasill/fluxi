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
        <Link href="/app/inicio" className="brand" title="Início">
          {/* Logo completo (símbolo + nome); no celular e com o menu recolhido, só o símbolo. */}
          <Image src="/logo-incflow.png" alt="INCFlow" width={199} height={32} className="brand-logo" priority />
          <Image src="/logo-incflow-marca.png" alt="INCFlow" width={36} height={36} className="brand-marca" priority />
        </Link>
        <nav className="nav" aria-label="Principal">
          <NavLink href="/app/inicio" titulo="Início"><Icone nome="inicio" /><span className="nav-texto">Início</span></NavLink>
          <NavLink href="/app/pops" titulo="POPs"><Icone nome="pop" /><span className="nav-texto">POPs</span></NavLink>
          <span className="nav-label">ESTRUTURA</span>
          <NavLink href="/app/organizacoes" tambem={["/app/areas", "/app/processos"]} titulo="Organizações"><Icone nome="empresa" /><span className="nav-texto">Organizações</span></NavLink>
          <span className="nav-label">LABORATÓRIO</span>
          <NavLink href="/app/entrevistas" titulo="Entrevista com IA (em teste)"><Icone nome="microfone" /><span className="nav-texto">Entrevista com IA</span><span className="soon">TESTE</span></NavLink>
          <span className="nav-label">CONTA</span>
          <ContaMenu />
        </nav>
        <RecolherMenu />
      </aside>
      <div className="main">{children}</div>
      <VoltarAoTopo />
    </div>
  );
}
