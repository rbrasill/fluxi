'use client';
import { useEffect, useRef, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';

// Confirmações e avisos do próprio site, no lugar do confirm()/alert() do navegador.
// `confirmar` e `avisar` devolvem uma Promise e podem ser chamados de qualquer lugar do cliente;
// <Dialogos /> (no layout raiz) mostra um de cada vez, na ordem em que foram pedidos.

type Pedido = {
  id: number;
  tipo: 'confirmar' | 'avisar';
  titulo: string;
  mensagem?: string;
  acao: string;
  perigo: boolean;
  resolver: (ok: boolean) => void;
  foco: HTMLElement | null; // quem estava com o foco ao pedir; volta para ele ao fechar
};

let fila: Pedido[] = [];
const ouvintes = new Set<() => void>();
let hosts = 0;
let proximo = 1;

function mudar(nova: Pedido[]) {
  fila = nova;
  ouvintes.forEach((f) => f());
}

function abrir(p: Omit<Pedido, 'id' | 'resolver' | 'foco'>) {
  // Sem <Dialogos /> montado (não deveria acontecer), cai no do navegador para não travar a ação.
  if (!hosts) {
    const texto = [p.titulo, p.mensagem].filter(Boolean).join('\n\n');
    return Promise.resolve(p.tipo === 'confirmar' ? window.confirm(texto) : (window.alert(texto), true));
  }
  return new Promise<boolean>((resolver) => mudar([...fila, { ...p, id: proximo++, resolver, foco: document.activeElement as HTMLElement | null }]));
}

function responder(ok: boolean) {
  const [atual, ...resto] = fila;
  if (!atual) return;
  atual.resolver(ok);
  mudar(resto);
  atual.foco?.focus?.();
}

/** Pergunta antes de seguir. `perigo`: ação destrutiva (botão vermelho). Resolve `true` se a pessoa confirmou. */
export const confirmar = (o: { titulo: string; mensagem?: string; acao?: string; perigo?: boolean }) =>
  abrir({ tipo: 'confirmar', titulo: o.titulo, mensagem: o.mensagem, acao: o.acao ?? 'Confirmar', perigo: !!o.perigo });

/** Avisa algo (em geral, um erro) e espera a pessoa fechar. */
export const avisar = (titulo: string, mensagem?: string) =>
  abrir({ tipo: 'avisar', titulo, mensagem, acao: 'Ok', perigo: false }).then(() => undefined);

const assinar = (f: () => void) => { ouvintes.add(f); return () => { ouvintes.delete(f); }; };
const vazia: Pedido[] = [];

export function Dialogos() {
  const atual = useSyncExternalStore(assinar, () => fila, () => vazia)[0];
  const caixa = useRef<HTMLDivElement>(null);

  useEffect(() => {
    hosts++;
    return () => { hosts--; };
  }, []);

  // Como no confirm() do navegador, o teclado fica só com o diálogo: os atalhos da tela por baixo
  // (ex.: Delete no editor de marcação) não recebem nada. Esc cancela; Tab circula entre os botões.
  useEffect(() => {
    if (!atual) return;
    const tecla = (e: KeyboardEvent) => {
      e.stopPropagation();
      if (e.key === 'Escape') {
        e.preventDefault();
        responder(atual.tipo === 'avisar');
      } else if (e.key === 'Tab') {
        const botoes = [...(caixa.current?.querySelectorAll('button') ?? [])];
        if (!botoes.length) return;
        e.preventDefault();
        const i = botoes.indexOf(document.activeElement as HTMLButtonElement);
        botoes[(i + (e.shiftKey ? -1 : 1) + botoes.length) % botoes.length].focus();
      }
    };
    window.addEventListener('keydown', tecla, true);
    return () => window.removeEventListener('keydown', tecla, true);
  }, [atual]);

  if (!atual) return null;

  // Em tela cheia (editor de fluxograma), só o elemento em tela cheia aparece: o diálogo vai dentro dele.
  const destino = (document.fullscreenElement as HTMLElement | null) ?? document.body;
  return createPortal(
    <div key={atual.id} className="overlay overlay-dialogo" onClick={() => responder(atual.tipo === 'avisar')}>
      <div ref={caixa} className="dialog dialogo-curto" role={atual.tipo === 'confirmar' ? 'alertdialog' : 'dialog'} aria-modal="true"
        aria-labelledby="dialogo-titulo" aria-describedby={atual.mensagem ? 'dialogo-mensagem' : undefined} onClick={(e) => e.stopPropagation()}>
        <h2 id="dialogo-titulo">{atual.titulo}</h2>
        {atual.mensagem && <p id="dialogo-mensagem">{atual.mensagem}</p>}
        <div className="dialog-actions">
          {atual.tipo === 'confirmar' && <button type="button" className="btn" onClick={() => responder(false)}>Cancelar</button>}
          <button type="button" className={`btn ${atual.perigo ? 'btn-perigo' : 'btn-primary'}`} onClick={() => responder(true)} autoFocus>{atual.acao}</button>
        </div>
      </div>
    </div>,
    destino,
  );
}
