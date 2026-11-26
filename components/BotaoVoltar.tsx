'use client';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Icone } from '@/components/Icone';

// O botão de voltar das telas do POP e do processo. Volta para a página anterior quando ela é do app e desta aba;
// quando a tela foi aberta direto (link colado, aba nova, depois do login), sobe um nível (`destino`): do POP para o
// processo, do processo para a área. O histórico do navegador não diz se a página anterior é do app, então o
// caminho das páginas abertas nesta aba fica guardado aqui (`RastreadorDeNavegacao`, no layout das telas internas).

const CHAVE = 'incflow:caminho';
const MAXIMO = 50;

function ler(): string[] {
  try { const l = JSON.parse(sessionStorage.getItem(CHAVE) || '[]'); return Array.isArray(l) ? l : []; } catch { return []; }
}
function gravar(l: string[]) {
  try { sessionStorage.setItem(CHAVE, JSON.stringify(l.slice(-MAXIMO))); } catch { /* sem armazenamento: o botão sobe um nível */ }
}

/** Guarda as páginas abertas nesta aba: entrar numa página empilha; voltar para a anterior desempilha. */
export function RastreadorDeNavegacao() {
  const caminho = usePathname();
  useEffect(() => {
    const pilha = ler();
    if (pilha.at(-1) === caminho) return; // a mesma página, recarregada
    if (pilha.at(-2) === caminho) pilha.pop(); // voltou para a anterior
    else pilha.push(caminho);
    gravar(pilha);
  }, [caminho]);
  return null;
}

/** Há uma página do app antes desta, nesta aba. Aba nova (aberta com o meio do mouse, por exemplo) não tem. */
const temAnterior = () => ler().length > 1 && window.history.length > 1;

export function BotaoVoltar({ destino, rotulo, antes }: {
  /** Para onde ir quando não há página anterior: um nível acima. */
  destino: string;
  /** O nome do nível acima, para a dica do botão ("o processo", "a área"). */
  rotulo: string;
  /** O que fazer antes de sair (salvar o que está pendente). */
  antes?: () => Promise<void> | void;
}) {
  const router = useRouter();
  const [anterior, setAnterior] = useState(false);
  const [saindo, setSaindo] = useState(false);
  useEffect(() => { setAnterior(temAnterior()); }, []);
  async function voltar() {
    setSaindo(true);
    try { await antes?.(); } catch { /* o que não salvou continua pendente na página; sair é escolha da pessoa */ }
    if (temAnterior()) router.back();
    else router.push(destino);
  }
  return (
    <button type="button" className="btn btn-icon btn-voltar" onClick={() => void voltar()} disabled={saindo} aria-label="Voltar"
      title={anterior ? 'Voltar para a página anterior' : `Voltar para ${rotulo}`}>
      <Icone nome="seta-esquerda" tamanho={18} />
    </button>
  );
}
