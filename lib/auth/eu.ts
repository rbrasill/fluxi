'use client';
import { useEffect, useState } from 'react';

// Quem está logado, do lado do navegador (lido de /api/auth/eu uma vez por carregamento da página).
// `enabled: false` é o modo aberto de desenvolvimento (sem INC_AUTH_SECRET): tudo liberado, inclusive
// o que é só de administrador.

export type Nivel = 'comum' | 'gestor' | 'admin';
export type Eu = { enabled: false } | { enabled: true; name: string; email: string; personId: string; nivel: Nivel };

/** Administrador de verdade, ou o modo aberto de desenvolvimento. Enquanto não carregou (null), não. */
export const ehAdmin = (eu: Eu | null | undefined) => !!eu && (!eu.enabled || eu.nivel === 'admin');
/** Gestor ou administrador (ou o modo aberto de desenvolvimento). */
export const ehGestor = (eu: Eu | null | undefined) => !!eu && (!eu.enabled || eu.nivel !== 'comum');
/** A pessoa logada é esta (ou não há login: desenvolvimento). Sem resposta ainda, não. */
export const souEu = (eu: Eu | null | undefined, personId: string | null | undefined) => !!eu && (!eu.enabled || eu.personId === personId);

let pedido: Promise<Eu | null> | null = null;
export function carregarEu() {
  pedido ??= fetch('/api/auth/eu').then((r) => (r.ok ? (r.json() as Promise<Eu>) : null)).catch(() => null);
  return pedido;
}

/** null enquanto carrega ou sem resposta; depois, quem está logado. */
export function useEu() {
  const [eu, setEu] = useState<Eu | null>(null);
  useEffect(() => { void carregarEu().then(setEu); }, []);
  return eu;
}
