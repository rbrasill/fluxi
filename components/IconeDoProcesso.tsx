import { createElement, type CSSProperties } from 'react';
import { coresDoProcesso, TRACO_DOS_ICONES, type IconeDoProcesso, type NoDoIcone } from '@/lib/icones';

// O ícone do processo (decisão 133). O desenho vem dos nós guardados com o processo (ou do catálogo, no seletor) e é
// montado elemento por elemento, só com as marcas e os atributos que um ícone do Lucide usa: nada de HTML solto.

const MARCAS = new Set(['path', 'circle', 'ellipse', 'line', 'polygon', 'polyline', 'rect']);
const ATRIBUTOS = new Set(['d', 'cx', 'cy', 'r', 'rx', 'ry', 'x', 'y', 'x1', 'x2', 'y1', 'y2', 'width', 'height', 'points', 'fill']);

export function DesenhoDoIcone({ nos, tamanho = 18 }: { nos: NoDoIcone[]; tamanho?: number }) {
  return (
    <svg width={tamanho} height={tamanho} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={TRACO_DOS_ICONES} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {nos.filter(([marca]) => MARCAS.has(marca)).map(([marca, atributos], i) => createElement(marca, {
        key: i,
        ...Object.fromEntries(Object.entries(atributos).filter(([k, v]) => ATRIBUTOS.has(k) && (k !== 'fill' || v === 'none' || v === 'currentColor'))),
      }))}
    </svg>
  );
}

/**
 * O quadro colorido do processo: com o ícone escolhido ou, sem ícone, com o quadradinho de sempre. A cor é a escolhida
 * com o ícone ou a que sai do id do processo.
 */
export function QuadroDoProcesso({ id, icone, tamanho = 16, className = '' }: { id: string; icone?: IconeDoProcesso | null; tamanho?: number; className?: string }) {
  const c = coresDoProcesso(id, icone);
  return (
    <span className={`pasta-cor${icone ? ' com-icone' : ''}${className ? ` ${className}` : ''}`} style={{ background: c.fundo, color: c.tinta, '--miolo': c.miolo } as CSSProperties} aria-hidden="true">
      {icone && <DesenhoDoIcone nos={icone.nos} tamanho={tamanho} />}
    </span>
  );
}
