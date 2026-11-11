'use client';
import { useEffect, useRef } from 'react';

/**
 * Mantém uma lista de entrevistas em dia sem a pessoa recarregar a página (decisão 69): de 10 em 10 s enquanto
 * alguém está na ligação com a Maia (para a conversa abrir assim que terminar) e de 30 em 30 s enquanto há
 * entrevista aberta (para o selo "Em andamento" aparecer quando alguém ligar). Só com a aba visível.
 */
export function useAcompanharEntrevistas(lista: { status: string; em_ligacao?: boolean }[] | null, recarregar: () => unknown) {
  const fn = useRef(recarregar);
  useEffect(() => { fn.current = recarregar; });
  const aoVivo = !!lista?.some((x) => x.em_ligacao);
  const aberta = !!lista?.some((x) => x.status === 'convidada' || x.status === 'em_andamento');
  useEffect(() => {
    if (!aberta) return;
    const t = setInterval(() => { if (document.visibilityState === 'visible') void fn.current(); }, aoVivo ? 10_000 : 30_000);
    return () => clearInterval(t);
  }, [aberta, aoVivo]);
}
