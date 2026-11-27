'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Icone } from '@/components/Icone';

// O botão de voltar ao lado do caminho, no topo das telas (decisão 143). Sobe sempre um nível na hierarquia, não
// volta para a tela anterior: da gravação para o POP, do POP para o processo, do processo para a área, da área para
// a organização. Para voltar à tela anterior, há o voltar do navegador.

export function BotaoVoltar({ destino, rotulo, antes }: {
  /** O nível acima. */
  destino: string;
  /** O nome do nível acima, para a dica do botão ("o processo", "a área"). */
  rotulo: string;
  /** O que fazer antes de sair (salvar o que está pendente). */
  antes?: () => Promise<void> | void;
}) {
  const router = useRouter();
  const [saindo, setSaindo] = useState(false);
  async function voltar() {
    setSaindo(true);
    try { await antes?.(); } catch { /* o que não salvou continua pendente na página; sair é escolha da pessoa */ }
    router.push(destino);
  }
  return (
    <button type="button" className="btn btn-icon btn-voltar" onClick={() => void voltar()} disabled={saindo} aria-label={`Voltar para ${rotulo}`} title={`Voltar para ${rotulo}`}>
      <Icone nome="seta-esquerda" tamanho={18} />
    </button>
  );
}
