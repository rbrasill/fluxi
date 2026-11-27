import { TRACO_DOS_ICONES } from '@/lib/icones';
import { RELACOES, type Relacao } from '@/lib/referencias';

/** Ícone do tipo de relação de uma referência (decisão 35). */
export function IconeRelacao({ relacao, tamanho = 14 }: { relacao: Relacao; tamanho?: number }) {
  return (
    <svg className="ref-icone" width={tamanho} height={tamanho} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={TRACO_DOS_ICONES} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={RELACOES[relacao].icone} />
    </svg>
  );
}
