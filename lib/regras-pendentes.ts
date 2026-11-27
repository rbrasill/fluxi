'use client';
import { useEffect, useSyncExternalStore } from 'react';
import { carregarEu } from '@/lib/auth/eu';
import { regrasParaRevisar, type RegrasPendentes } from '@/lib/regras';

// As regras de negócio que esperam quem está logado (decisão 108), num lugar só para o selo do menu, o aviso flutuante
// e o aviso do Início. Confere ao abrir a plataforma, a cada minuto enquanto a aba está aberta e na frente, e ao voltar
// para a aba: quem já está usando a plataforma fica sabendo sem precisar entrar de novo.

const INTERVALO_MS = 60_000;
let atual: RegrasPendentes | null = null;
const ouvintes = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;
let buscando: Promise<void> | null = null;

function avisar() { for (const f of ouvintes) f(); }

/** Busca de novo agora (por exemplo, depois de confirmar uma regra). */
export function atualizarRegrasPendentes() {
  buscando ??= (async () => {
    try {
      const eu = await carregarEu();
      // Sem login (desenvolvimento), não há "você" a avisar.
      const lista = eu?.enabled ? await regrasParaRevisar() : [];
      atual = Array.isArray(lista) ? lista : [];
    } catch {
      atual ??= []; // sem resposta: mantém o que tinha e tenta na próxima volta
    } finally {
      buscando = null;
      avisar();
    }
  })();
  return buscando;
}

function ligar() {
  if (timer || typeof window === 'undefined') return;
  void atualizarRegrasPendentes();
  timer = setInterval(() => { if (document.visibilityState === 'visible') void atualizarRegrasPendentes(); }, INTERVALO_MS);
  document.addEventListener('visibilitychange', aoVoltar);
  window.addEventListener('focus', aoVoltar);
}
function aoVoltar() { if (document.visibilityState === 'visible') void atualizarRegrasPendentes(); }

function inscrever(f: () => void) {
  ouvintes.add(f);
  ligar();
  return () => { ouvintes.delete(f); };
}

/** null enquanto não conferiu; depois, os processos com regras esperando a pessoa. */
export function useRegrasPendentes() {
  const lista = useSyncExternalStore(inscrever, () => atual, () => null);
  useEffect(() => { ligar(); }, []);
  return lista;
}

export const totalPendente = (l: RegrasPendentes | null) => (l ?? []).reduce((n, p) => n + p.sugeridas + p.ajustes, 0);
