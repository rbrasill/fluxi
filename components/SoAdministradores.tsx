'use client';
import Link from 'next/link';
import { Icone } from '@/components/Icone';
import { ehAdmin, useEu } from '@/lib/auth/eu';

// Telas só de administradores (Pessoas e acessos, Painel da Maia; decisão 64). O servidor já recusa os dados
// para quem não é administrador; aqui a tela nem abre: quem digita o endereço vê o aviso, sem formulário.
export function SoAdministradores({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  const eu = useEu();
  if (eu === null) return <div className="page page-estreita"><p className="notice">Carregando…</p></div>;
  if (!ehAdmin(eu)) {
    return (
      <div className="page page-estreita">
        <div className="empty">
          <Icone nome="pessoas" tamanho={28} />
          <h2>{titulo} é só para administradores</h2>
          <p>Se você precisa cadastrar uma pessoa ou mudar um acesso, peça a um administrador do INCFlow.</p>
          <Link href="/app/inicio" className="btn btn-primary">Voltar ao início</Link>
        </div>
      </div>
    );
  }
  return <>{children}</>;
}
