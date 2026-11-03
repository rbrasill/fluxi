import type { StatusPop } from '@/lib/pops';

const ROTULO: Record<StatusPop, string> = { rascunho: 'Rascunho', publicado: 'Publicado' };

/**
 * Selo do estado do POP: rascunho (em elaboração) ou publicado (vigente). Com `offline`, o POP está
 * publicado mas a página pública está desligada (decisão 34).
 */
export function SeloStatus({ status, offline = false }: { status: StatusPop; offline?: boolean }) {
  if (status === 'publicado' && offline) {
    return <span className="selo-status selo-offline" title="Publicado, com a página pública desligada (offline)">Publicado · offline</span>;
  }
  return <span className={`selo-status selo-${status}`}>{ROTULO[status] ?? status}</span>;
}
