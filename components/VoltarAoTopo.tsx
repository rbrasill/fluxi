'use client';
import { useEffect, useState } from 'react';
import { Icone } from '@/components/Icone';

// Botão discreto no canto da tela para voltar ao topo. Só aparece depois de rolar uma tela inteira
// (ex.: POP com muitos passos); em páginas curtas não aparece.

export function VoltarAoTopo() {
  const [visivel, setVisivel] = useState(false);

  useEffect(() => {
    const conferir = () => setVisivel(window.scrollY > window.innerHeight);
    conferir();
    window.addEventListener('scroll', conferir, { passive: true });
    window.addEventListener('resize', conferir);
    return () => {
      window.removeEventListener('scroll', conferir);
      window.removeEventListener('resize', conferir);
    };
  }, []);

  function subir() {
    const suave = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: 0, behavior: suave ? 'smooth' : 'auto' });
  }

  return (
    <button type="button" className={`voltar-topo ${visivel ? 'visivel' : ''}`} onClick={subir} aria-label="Voltar ao topo" title="Voltar ao topo" tabIndex={visivel ? 0 : -1}>
      <Icone nome="topo" tamanho={18} />
    </button>
  );
}
