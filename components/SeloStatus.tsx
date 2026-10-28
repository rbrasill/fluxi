import type { StatusPop } from '@/lib/pops';

const ROTULO: Record<StatusPop, string> = { rascunho: 'Rascunho', publicado: 'Publicado' };

/** Selo do estado do POP: rascunho (em elaboração) ou publicado (vigente). */
export function SeloStatus({ status }: { status: StatusPop }) {
  return <span className={`selo-status selo-${status}`}>{ROTULO[status] ?? status}</span>;
}
