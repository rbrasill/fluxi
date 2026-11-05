import { Icone } from '@/components/Icone';

// Ícone das linhas de processo nas listas (área, lista de processos, "Processos sem POP" no Início):
// a engrenagem com setas, num quadradinho lilás (o tom do selo "Processo"), escolhida pelo Rafael.
// Processo arquivado mantém o ícone de arquivo, no mesmo quadradinho.

export const ICONE_PROCESSO_LISTA = '/icones/processo-lista.png';

export function IconeProcesso({ arquivado = false }: { arquivado?: boolean }) {
  return (
    <span className="pop-icone icone-processo">
      {arquivado ? <Icone nome="arquivar" tamanho={20} /> : <img src={ICONE_PROCESSO_LISTA} alt="" width={26} height={26} />}
    </span>
  );
}
