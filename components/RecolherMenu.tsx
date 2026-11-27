'use client';
import { useEffect, useState } from 'react';
import { Icone } from '@/components/Icone';
import { CHAVE_MENU } from '@/lib/menu';

// Recolhe o menu lateral para só os ícones, dando mais largura ao conteúdo. A escolha fica guardada
// neste navegador; o script no layout aplica antes de a página aparecer (sem o menu "pular").

export function RecolherMenu() {
  const [recolhido, setRecolhido] = useState(false);
  useEffect(() => { setRecolhido(document.documentElement.dataset.menu === 'recolhido'); }, []);

  function alternar() {
    const novo = !recolhido;
    setRecolhido(novo);
    if (novo) document.documentElement.dataset.menu = 'recolhido';
    else delete document.documentElement.dataset.menu;
    try { localStorage.setItem(CHAVE_MENU, novo ? '1' : '0'); } catch { /* sem armazenamento: vale só nesta página */ }
  }

  const rotulo = recolhido ? 'Expandir menu' : 'Recolher menu';
  return (
    <button type="button" className="recolher-menu" onClick={alternar} aria-label={rotulo} title={rotulo} aria-expanded={!recolhido}>
      <Icone nome="painel-lateral" />
    </button>
  );
}
