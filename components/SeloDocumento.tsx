import { Icone } from '@/components/Icone';
import type { TipoDoc } from '@/lib/referencias';

// Selo do tipo de documento, abaixo do nome (decisão 125): "Processo" em azul, com as duas etapas ligadas, ou "POP"
// em verde, com o documento. As mesmas cores do fundo de cada página, para a pessoa saber onde está.
// `ICONE_DOC` são os ícones coloridos das páginas públicas, em `public/icones/`.

export const ICONE_DOC: Record<TipoDoc, string> = { processo: '/icones/processo.svg', pop: '/icones/pop.svg' };
const ROTULO: Record<TipoDoc, string> = { processo: 'Processo', pop: 'POP' };
const ICONE: Record<TipoDoc, string> = { processo: 'processos', pop: 'pop' };

export function SeloDocumento({ tipo }: { tipo: TipoDoc }) {
  return (
    <span className={`selo-doc selo-${tipo}`}>
      <Icone nome={ICONE[tipo]} tamanho={14} />
      {ROTULO[tipo]}
    </span>
  );
}
