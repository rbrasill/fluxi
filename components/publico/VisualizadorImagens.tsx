'use client';
import { useCallback, useEffect, useRef, useState, type PointerEvent } from 'react';
import { Icone } from '@/components/Icone';

// Visualizador em tela cheia dos prints da página pública do POP: abre ajustado à tela e permite
// aproximar (clique/toque na imagem, rodinha do mouse, botões, pinça no celular), arrastar a imagem
// aproximada e passar para o print anterior ou o próximo. Esc ou clique fora da imagem fecha.

export type ImagemAmpliavel = { src: string; alt: string; legenda: string };

const MIN = 1;
const MAX = 8;
const PASSO = 1.5; // cada clique em +/− multiplica ou divide o zoom
type Vista = { s: number; x: number; y: number }; // escala sobre o tamanho ajustado e deslocamento (px)
const AJUSTADA: Vista = { s: 1, x: 0, y: 0 };

export function VisualizadorImagens({ imagens, inicial, aoFechar }: { imagens: ImagemAmpliavel[]; inicial: number; aoFechar: () => void }) {
  const [i, setI] = useState(inicial);
  const [vista, setVista] = useState<Vista>(AJUSTADA);
  const [medidas, setMedidas] = useState<{ ajustada: number; natural: number } | null>(null); // larguras (px)
  const [arrastando, setArrastando] = useState(false); // sem animação enquanto o dedo/mouse conduz
  const caixa = useRef<HTMLDivElement>(null);
  const palco = useRef<HTMLDivElement>(null);
  const img = useRef<HTMLImageElement>(null);
  const botaoFechar = useRef<HTMLButtonElement>(null);
  const ponteiros = useRef(new Map<number, { x: number; y: number }>());
  const gesto = useRef<
    | { tipo: 'arrastar'; x0: number; y0: number; v0: Vista; moveu: boolean; naImagem: boolean }
    | { tipo: 'pinca'; d0: number; s0: number }
    | null
  >(null);
  const atual = imagens[i];
  const varias = imagens.length > 1;

  // Trava a rolagem da página e devolve o foco a quem abriu.
  useEffect(() => {
    const antes = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    botaoFechar.current?.focus();
    return () => { document.body.style.overflow = overflow; antes?.focus?.(); };
  }, []);

  const medir = useCallback(() => {
    const el = img.current;
    if (el?.naturalWidth) setMedidas({ ajustada: el.offsetWidth, natural: el.naturalWidth });
  }, []);
  useEffect(() => {
    window.addEventListener('resize', medir);
    return () => window.removeEventListener('resize', medir);
  }, [medir]);

  /** Mantém a imagem aproximada cobrindo o palco (não deixa arrastar para fora). */
  const limitar = useCallback((s: number, x: number, y: number) => {
    const el = img.current, st = palco.current;
    if (!el || !st) return { x, y };
    const mx = Math.max(0, (el.offsetWidth * s - st.clientWidth) / 2);
    const my = Math.max(0, (el.offsetHeight * s - st.clientHeight) / 2);
    return { x: Math.min(mx, Math.max(-mx, x)), y: Math.min(my, Math.max(-my, y)) };
  }, []);

  /** Muda o zoom mantendo parado o ponto (px, py), relativo ao centro do palco. */
  const zoomPara = useCallback((alvo: number, px = 0, py = 0) => setVista((v) => {
    const s = Math.min(MAX, Math.max(MIN, alvo));
    if (s <= MIN + 0.001) return AJUSTADA;
    const k = s / v.s;
    return { s, ...limitar(s, px - k * (px - v.x), py - k * (py - v.y)) };
  }), [limitar]);

  const relativo = (cx: number, cy: number): [number, number] => {
    const r = palco.current!.getBoundingClientRect();
    return [cx - r.left - r.width / 2, cy - r.top - r.height / 2];
  };

  // Tamanho real: a escala em que 1 pixel da imagem = 1 pixel da tela.
  const escalaReal = medidas && medidas.natural > medidas.ajustada ? Math.min(MAX, medidas.natural / medidas.ajustada) : 1;
  const porcento = medidas ? Math.round((vista.s * medidas.ajustada * 100) / medidas.natural) : null;

  function ir(n: number) {
    if (!varias) return;
    setI((n + imagens.length) % imagens.length);
    setVista(AJUSTADA);
    setMedidas(null);
  }

  // Rodinha do mouse (e pinça do touchpad, que chega como ctrl + rodinha): zoom no ponto do cursor.
  useEffect(() => {
    const st = palco.current;
    if (!st) return;
    const roda = (e: WheelEvent) => {
      e.preventDefault();
      const dy = e.deltaMode === 1 ? e.deltaY * 40 : e.deltaY;
      const [px, py] = relativo(e.clientX, e.clientY);
      setVista((v) => {
        const s = Math.min(MAX, Math.max(MIN, v.s * Math.exp(-dy * (e.ctrlKey ? 0.01 : 0.0015))));
        if (s <= MIN + 0.001) return AJUSTADA;
        const k = s / v.s;
        return { s, ...limitar(s, px - k * (px - v.x), py - k * (py - v.y)) };
      });
    };
    st.addEventListener('wheel', roda, { passive: false });
    return () => st.removeEventListener('wheel', roda);
  }, [limitar]);

  function baixo(e: PointerEvent<HTMLDivElement>) {
    if ((e.target as HTMLElement).closest('button')) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    palco.current?.setPointerCapture(e.pointerId);
    ponteiros.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pts = [...ponteiros.current.values()];
    if (pts.length === 2) {
      gesto.current = { tipo: 'pinca', d0: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y), s0: vista.s };
    } else if (pts.length === 1) {
      gesto.current = { tipo: 'arrastar', x0: e.clientX, y0: e.clientY, v0: vista, moveu: false, naImagem: e.target === img.current };
    }
  }

  function mover(e: PointerEvent<HTMLDivElement>) {
    if (!ponteiros.current.has(e.pointerId)) return;
    ponteiros.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesto.current;
    if (!g) return;
    if (g.tipo === 'pinca') {
      const pts = [...ponteiros.current.values()];
      if (pts.length < 2) return;
      const d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      const [px, py] = relativo((pts[0].x + pts[1].x) / 2, (pts[0].y + pts[1].y) / 2);
      setArrastando(true);
      zoomPara(g.s0 * (d / g.d0), px, py);
      return;
    }
    const dx = e.clientX - g.x0, dy = e.clientY - g.y0;
    if (Math.abs(dx) + Math.abs(dy) > 4) g.moveu = true;
    if (g.moveu && g.v0.s > 1) { setArrastando(true); setVista({ s: g.v0.s, ...limitar(g.v0.s, g.v0.x + dx, g.v0.y + dy) }); }
  }

  function cima(e: PointerEvent<HTMLDivElement>) {
    if (!ponteiros.current.delete(e.pointerId)) return;
    const g = gesto.current;
    if (ponteiros.current.size > 0) {
      // Saiu um dedo da pinça: o que ficou passa a arrastar dali.
      const [p] = [...ponteiros.current.values()];
      gesto.current = { tipo: 'arrastar', x0: p.x, y0: p.y, v0: vista, moveu: true, naImagem: false };
      return;
    }
    gesto.current = null;
    setArrastando(false);
    if (!g || g.tipo !== 'arrastar' || g.moveu) return;
    if (!g.naImagem) { aoFechar(); return; } // clique fora da imagem
    // Clique na imagem: aproxima no ponto clicado; aproximada, volta a ajustar.
    if (vista.s > 1) { setVista(AJUSTADA); return; }
    const [px, py] = relativo(e.clientX, e.clientY);
    zoomPara(Math.max(2.5, escalaReal), px, py);
  }

  // Teclado na janela inteira: um botão que fica desativado (ex.: "Ajustar") perde o foco, e as
  // teclas continuam valendo enquanto o visualizador está aberto.
  const tecla = useRef<(e: globalThis.KeyboardEvent) => void>(() => {});
  tecla.current = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); aoFechar(); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); ir(i + 1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); ir(i - 1); }
    else if (e.key === '+' || e.key === '=') { e.preventDefault(); zoomPara(vista.s * PASSO); }
    else if (e.key === '-') { e.preventDefault(); zoomPara(vista.s / PASSO); }
    else if (e.key === '0') { e.preventDefault(); setVista(AJUSTADA); }
    else if (e.key === 'Tab') {
      // O foco fica dentro do visualizador.
      const focaveis = [...(caixa.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href]') ?? [])];
      if (!focaveis.length) return;
      const primeiro = focaveis[0], ultimo = focaveis[focaveis.length - 1];
      const dentro = caixa.current?.contains(document.activeElement);
      if (!dentro) { e.preventDefault(); (e.shiftKey ? ultimo : primeiro).focus(); }
      else if (e.shiftKey && document.activeElement === primeiro) { e.preventDefault(); ultimo.focus(); }
      else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primeiro.focus(); }
    }
  };
  useEffect(() => {
    const ouvir = (e: globalThis.KeyboardEvent) => tecla.current(e);
    window.addEventListener('keydown', ouvir);
    return () => window.removeEventListener('keydown', ouvir);
  }, []);

  const aproximada = vista.s > 1;

  return (
    <div className="zoom" ref={caixa} role="dialog" aria-modal="true" aria-label={`Imagem ampliada: ${atual.legenda}`}>
      <header className="zoom-barra">
        <div className="zoom-legenda">
          <strong>{atual.legenda}</strong>
          {varias && <span>{i + 1} de {imagens.length}</span>}
        </div>
        <div className="zoom-ferramentas">
          <button type="button" className="zoom-btn" onClick={() => zoomPara(vista.s / PASSO)} disabled={!aproximada} aria-label="Afastar" title="Afastar (−)"><Icone nome="zoom-menos" /></button>
          <span className="zoom-porcento" aria-live="polite">{porcento !== null ? `${porcento}%` : ''}</span>
          <button type="button" className="zoom-btn" onClick={() => zoomPara(vista.s * PASSO)} disabled={vista.s >= MAX} aria-label="Aproximar" title="Aproximar (+)"><Icone nome="zoom-mais" /></button>
          <button type="button" className="zoom-btn zoom-texto" onClick={() => setVista(AJUSTADA)} disabled={!aproximada} title="Ajustar à tela (0)"><Icone nome="ajustar" />Ajustar</button>
          <button type="button" className="zoom-btn zoom-texto" onClick={() => zoomPara(escalaReal)} disabled={escalaReal <= 1 || Math.abs(vista.s - escalaReal) < 0.01} title="Tamanho real da imagem"><Icone nome="expandir" />Tamanho real</button>
          <span className="zoom-sep" />
          <button type="button" className="zoom-btn" ref={botaoFechar} onClick={aoFechar} aria-label="Fechar" title="Fechar (Esc)"><Icone nome="fechar" /></button>
        </div>
      </header>

      <div
        className={`zoom-palco${aproximada ? ' aproximada' : ''}${arrastando ? ' arrastando' : ''}`}
        ref={palco}
        onPointerDown={baixo}
        onPointerMove={mover}
        onPointerUp={cima}
        onPointerCancel={cima}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          key={atual.src}
          ref={img}
          src={atual.src}
          alt={atual.alt}
          draggable={false}
          onLoad={medir}
          style={{ transform: `translate(${vista.x}px, ${vista.y}px) scale(${vista.s})` }}
        />
        {varias && (
          <>
            <button type="button" className="zoom-nav anterior" onClick={() => ir(i - 1)} aria-label="Imagem anterior" title="Anterior (←)"><Icone nome="voltar" tamanho={26} /></button>
            <button type="button" className="zoom-nav proxima" onClick={() => ir(i + 1)} aria-label="Próxima imagem" title="Próxima (→)"><Icone nome="avancar" tamanho={26} /></button>
          </>
        )}
      </div>

      {/* Dica conforme o aparelho: mouse e teclado no computador, toque no celular. */}
      <p className="zoom-dica">
        <span className="mouse">
          {aproximada ? 'Arraste para mover · clique na imagem para ajustar à tela' : 'Clique na imagem ou use a rodinha do mouse para aproximar'}
          {varias ? ' · ← → trocam de imagem' : ''} · Esc fecha
        </span>
        <span className="toque">{aproximada ? 'Arraste para mover · toque na imagem para ajustar à tela' : 'Toque na imagem ou faça pinça para aproximar'}</span>
      </p>
    </div>
  );
}
