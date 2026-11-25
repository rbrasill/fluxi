import type { StatusPop } from '@/lib/pops';

const ROTULO: Record<StatusPop, string> = { rascunho: 'Rascunho', publicado: 'Publicado' };

/**
 * Selo do estado do POP ou do processo: rascunho (em elaboração) ou publicado (vigente). Com `offline`, está
 * publicado mas a página pública está desligada (decisão 34): o selo diz só "Offline" (decisão 130).
 */
export function SeloStatus({ status, offline = false }: { status: StatusPop; offline?: boolean }) {
  if (status === 'publicado' && offline) {
    // Só "Offline" (decisão 130): "Publicado · offline" confundia. O título explica que a versão publicada está guardada.
    return <span className="selo-status selo-offline" title="Publicado, com a página pública desligada: a versão publicada está guardada, fora do ar">Offline</span>;
  }
  return <span className={`selo-status selo-${status}`}>{ROTULO[status] ?? status}</span>;
}
