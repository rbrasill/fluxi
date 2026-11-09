'use client';
import { useEffect, useState } from 'react';
import { Icone } from '@/components/Icone';
import { NavLink } from '@/components/NavLink';

// A parte do menu que depende de quem está logado (decisão 50): "Pessoas e acessos" para administradores,
// e o nome com o botão Sair. Também leva de volta ao login quando a sessão acaba no meio do uso
// (qualquer rota de dados respondendo 401).

type Eu = { enabled: false } | { enabled: true; name: string; email: string; nivel: 'comum' | 'gestor' | 'admin' };
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
  const [eu, setEu] = useState<Eu | null>(null);
  useEffect(() => {
    voltarAoLoginQuandoASessaoAcabar();
    fetch('/api/auth/eu').then((r) => (r.ok ? r.json() : null)).then(setEu).catch(() => setEu(null));
  }, []);

  async function sair() {
    await fetch('/api/auth/sair', { method: 'POST' }).catch(() => {});
    window.location.href = '/login';
  }

  const admin = eu && (!eu.enabled || eu.nivel === 'admin'); // sem login (desenvolvimento), tudo aberto
  return (
    <>
      {admin && <NavLink href="/app/pessoas" titulo="Pessoas e acessos"><Icone nome="areas" /><span className="nav-texto">Pessoas e acessos</span></NavLink>}
      {eu?.enabled && (
        <div className="conta" title={eu.email}>
          <span className="conta-nome nav-texto">{eu.name}<small>{ROTULO_NIVEL[eu.nivel]}</small></span>
          <button type="button" className="conta-sair" onClick={() => void sair()} title="Sair"><Icone nome="voltar" tamanho={16} /><span className="nav-texto">Sair</span></button>
        </div>
      )}
    </>
  );
}
