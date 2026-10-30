'use client';
import { useRef, useState } from 'react';

// Número do passo no editor do POP. Dá para digitar outra posição e mover o passo direto para ela
// (Enter ou ao sair do campo), sem clicar ↑/↓ várias vezes. Esc desiste.

export function PosicaoPasso({ numero, total, aoMover }: { numero: number; total: number; aoMover: (posicao: number) => void }) {
  const [valor, setValor] = useState<string | null>(null); // null = mostra o número atual
  const desistiu = useRef(false);

  if (total < 2) return <span className="passo-num">{numero}</span>;

  function aplicar() {
    const n = Number(valor);
    setValor(null);
    if (desistiu.current || !valor || !Number.isInteger(n)) return;
    const destino = Math.min(Math.max(n, 1), total);
    if (destino !== numero) aoMover(destino);
  }

  return (
    <input className="passo-num" inputMode="numeric" value={valor ?? String(numero)}
      aria-label={`Posição do passo ${numero} de ${total}`} title={`Passo ${numero} de ${total}: digite outra posição e tecle Enter para mover`}
      onFocus={(e) => { desistiu.current = false; setValor(String(numero)); e.currentTarget.select(); }}
      onChange={(e) => setValor(e.target.value.replace(/\D/g, '').slice(0, 3))}
      onKeyDown={(e) => {
        if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); }
        else if (e.key === 'Escape') { e.preventDefault(); desistiu.current = true; e.currentTarget.blur(); }
      }}
      onBlur={aplicar} />
  );
}
