'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { Icone } from '@/components/Icone';
import { NavLink } from '@/components/NavLink';
import { ehAdmin, useEu } from '@/lib/auth/eu';
import { iniciais } from '@/lib/iniciais';

// A parte do menu que depende de quem está logado (decisão 50): "Pessoas e acessos" e o "Painel da Maia"
// para administradores, e o cartão da conta, que abre "Meu perfil" (decisão 84), com o botão Sair. Também leva de volta ao login quando a sessão acaba
// no meio do uso (qualquer rota de dados respondendo 401).

const ROTULO_NIVEL = { comum: 'Comum', gestor: 'Gestor', admin: 'Administrador' };

function voltarAoLoginQuandoASessaoAcabar() {
  const w = window as Window & { __sessaoVigiada?: boolean };
  if (w.__sessaoVigiada) return;
  w.__sessaoVigiada = true;
  const original = window.fetch.bind(window);
  window.fetch = async (...args: Parameters<typeof fetch>) => {
    const r = await original(...args);
    if (r.status === 401) {
      const alvo = typeof args[0] === 'string' ? args[0] : args[0] instanceof URL ? args[0].href : args[0].url;
      const u = new URL(alvo, location.origin);
      if (u.origin === location.origin && u.pathname.startsWith('/api/') && !u.pathname.startsWith('/api/auth/')) {
        location.href = `/login?next=${encodeURIComponent(location.pathname + location.search)}`;
      }
    }
    return r;
  };
}

export function ContaMenu() {
  useEffect(() => { voltarAoLoginQuandoASessaoAcabar(); }, []);
  const eu = useEu();
  const noPerfil = (usePathname() ?? '').startsWith('/app/perfil');

  async function sair() {
    await fetch('/api/auth/sair', { method: 'POST' }).catch(() => {});
    window.location.href = '/login';
  }

  const admin = ehAdmin(eu); // sem login (desenvolvimento), tudo aberto
  return (
    <>
      {admin && <NavLink href="/app/pessoas" titulo="Pessoas e acessos"><Icone nome="pessoas" /><span className="nav-texto">Pessoas e acessos</span></NavLink>}
      {admin && <NavLink href="/app/maia" titulo="Painel da Maia: custos, tempos e métricas das entrevistas"><Icone nome="ia" /><span className="nav-texto">Painel da Maia</span></NavLink>}
      {eu?.enabled && (
        <div className={`conta${noPerfil ? ' ativa' : ''}`}>
          <Link href="/app/perfil" className="conta-perfil" title={`Meu perfil · ${eu.email}`} aria-current={noPerfil ? 'page' : undefined}>
            <span className="conta-avatar" aria-hidden="true">{iniciais(eu.name)}</span>
            <span className="conta-nome nav-texto">{eu.name}<small>{noPerfil ? 'Meu perfil' : ROTULO_NIVEL[eu.nivel]}</small></span>
          </Link>
          <button type="button" className="conta-sair" onClick={() => void sair()} title="Sair" aria-label="Sair"><Icone nome="sair" tamanho={18} /></button>
        </div>
      )}
    </>
  );
}
