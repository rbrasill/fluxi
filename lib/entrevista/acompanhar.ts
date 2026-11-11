'use client';
import { useEffect, useRef } from 'react';
import { consultarSituacao } from '@/lib/entrevistas';

// As telas percebem sozinhas quando uma ligação com a Maia começa ou termina (decisão 69), sem a pessoa recarregar
// a página. Só com a aba visível; se uma consulta falhar, fica o que está na tela e a próxima tenta de novo.

const visivel = () => typeof document === 'undefined' || document.visibilityState === 'visible';

/**
 * Uma lista de entrevistas (do processo, "Conversas com a Maia", Painel da Maia): busca de novo de 10 em 10 s
 * enquanto alguém está na ligação (para a conversa abrir assim que terminar) e de 30 em 30 s enquanto há entrevista
 * aberta (para o selo "Em andamento" aparecer quando alguém ligar).
 */
export function useAcompanharEntrevistas(lista: { status: string; em_ligacao?: boolean }[] | null, recarregar: () => unknown) {
  const fn = useRef(recarregar);
  useEffect(() => { fn.current = recarregar; });
  const aoVivo = !!lista?.some((x) => x.em_ligacao);
  const aberta = !!lista?.some((x) => x.status === 'convidada' || x.status === 'em_andamento');
  useEffect(() => {
    if (!aberta) return;
    const t = setInterval(() => { if (visivel()) void fn.current(); }, aoVivo ? 10_000 : 30_000);
    return () => clearInterval(t);
  }, [aberta, aoVivo]);
}

/**
 * Uma entrevista aberta na tela por quem não é a pessoa entrevistada. Com a conversa fechada pela ligação, busca a
 * entrevista de novo de 10 em 10 s, até a ligação terminar. Com o convite pendente ou a conversa pausada, consulta só
 * a situação (leve, sem a conversa) de 15 em 15 s e busca a entrevista inteira quando a ligação começa ou a
 * situação muda; assim, quem estava lendo a conversa pausada vê o aviso de bloqueio assim que a pessoa liga.
 */
export function useAcompanharEntrevista(id: string, e: { status: string; conteudo_oculto?: boolean } | null | undefined, deFora: boolean, recarregar: () => unknown) {
  const fn = useRef(recarregar);
  useEffect(() => { fn.current = recarregar; });
  const status = e?.status ?? '';
  const oculto = !!e?.conteudo_oculto;
  const aberta = status === 'convidada' || status === 'em_andamento';
  useEffect(() => {
    if (!deFora || !status) return;
    if (oculto) {
      const t = setInterval(() => { if (visivel()) void fn.current(); }, 10_000);
      return () => clearInterval(t);
    }
    if (!aberta) return;
    const t = setInterval(() => {
      if (!visivel()) return;
      consultarSituacao(id).then((s) => { if (s.em_ligacao || s.status !== status) void fn.current(); }).catch(() => {});
    }, 15_000);
    return () => clearInterval(t);
  }, [id, deFora, status, oculto, aberta]);
}
