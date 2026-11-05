import type { TipoDoc } from '@/lib/referencias';

// Selo do tipo de documento no topo da página, acima do nome: "Processo" (as faixas) ou "POP" (as
// pegadas). Deixa claro se a pessoa está dentro de um processo ou de um POP. Os ícones ficam em
// `public/icones/`, sem fundo.

export const ICONE_DOC: Record<TipoDoc, string> = { processo: '/icones/processo.svg', pop: '/icones/pop.svg' };
const ROTULO: Record<TipoDoc, string> = { processo: 'Processo', pop: 'POP' };

export function SeloDocumento({ tipo }: { tipo: TipoDoc }) {
  return (
    <span className={`selo-doc selo-${tipo}`}>
      <img src={ICONE_DOC[tipo]} alt="" width={20} height={20} />
      {ROTULO[tipo]}
    </span>
  );
}
