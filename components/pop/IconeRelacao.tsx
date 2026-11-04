import { RELACOES, type Relacao } from '@/lib/referencias';

/** Ícone do tipo de relação de uma referência (decisão 35). */
export function IconeRelacao({ relacao, tamanho = 14 }: { relacao: Relacao; tamanho?: number }) {
  return (
    <svg className="ref-icone" width={tamanho} height={tamanho} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={RELACOES[relacao].icone} />
    </svg>
  );
}
