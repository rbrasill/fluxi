'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Icone } from '@/components/Icone';

// Leitor de PDF dentro da plataforma (decisão 141), com o pdf.js: as páginas uma embaixo da outra, desenhadas só
// quando chegam perto da tela; navegação por página (botões, campo e teclado) e zoom (botões, Ctrl + rodinha e
// "Ajustar à largura"). Não usa o leitor do navegador, que no celular não mostra PDF dentro da página.

type Pdfjs = typeof import('pdfjs-dist/legacy/build/pdf.mjs');
type Documento = Awaited<ReturnType<Pdfjs['getDocument']>['promise']>;
type Pagina = Awaited<ReturnType<Documento['getPage']>>;
type Tarefa = ReturnType<Pagina['render']>;

const ZOOMS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4]; // sobre a largura ajustada
const MARGEM = 16; // espaço em volta das páginas (px)
const MAX_PIXELS = 12_000_000; // por página desenhada: acima disso a página sai com menos definição
const PERTO = 1; // quantas páginas além das visíveis ficam desenhadas

let carregando: Promise<Pdfjs> | null = null;
/** Carrega o pdf.js uma vez e aponta para os arquivos de apoio, servidos pelo próprio app. */
function pdfjs() {
  carregando ??= import('pdfjs-dist/legacy/build/pdf.mjs').then((lib) => {
    lib.GlobalWorkerOptions.workerSrc = `${base(lib)}/build/pdf.worker.min.mjs`;
    return lib;
  });
  carregando.catch(() => { carregando = null; });
  return carregando;
}
const base = (lib: Pdfjs) => `/api/publico/pdfjs/${lib.version}`;

export function LeitorPdf({ url, nome }: { url: string; nome: string }) {
  const [doc, setDoc] = useState<Documento | null>(null);
  const [erro, setErro] = useState(false);
  const [proporcoes, setProporcoes] = useState<number[]>([]); // altura ÷ largura de cada página
  const [largura, setLargura] = useState(0); // largura útil do palco (px)
  const [zoom, setZoom] = useState(1);
  const [pagina, setPagina] = useState(1);
  const [campo, setCampo] = useState('1');
  const palco = useRef<HTMLDivElement>(null);
  const folhas = useRef<(HTMLDivElement | null)[]>([]);
  const desenhadas = useRef(new Map<number, { chave: string; tarefa: Tarefa | null }>());

  // Abre o documento. A proporção das páginas vem da primeira; cada uma se corrige quando é desenhada.
  useEffect(() => {
    let vivo = true;
    let tarefa: ReturnType<Pdfjs['getDocument']> | null = null;
    setDoc(null); setErro(false); setProporcoes([]); setPagina(1); setCampo('1'); setZoom(1);
    pdfjs().then(async (lib) => {
      if (!vivo) return;
      const b = base(lib);
      tarefa = lib.getDocument({ url, cMapUrl: `${b}/cmaps/`, cMapPacked: true, standardFontDataUrl: `${b}/standard_fonts/`, wasmUrl: `${b}/wasm/`, iccUrl: `${b}/iccs/` });
      const d = await tarefa.promise;
      const primeira = await d.getPage(1);
      const v = primeira.getViewport({ scale: 1 });
      if (!vivo) return;
      setProporcoes(Array.from({ length: d.numPages }, () => v.height / v.width));
      setDoc(d);
    }).catch(() => { if (vivo) setErro(true); });
    return () => { vivo = false; void tarefa?.destroy(); };
  }, [url]);

  useEffect(() => {
    const el = palco.current;
    if (!el) return;
    const medir = () => setLargura(Math.max(0, el.clientWidth - 2 * MARGEM));
    medir();
    const obs = new ResizeObserver(medir);
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const larguraDaFolha = Math.max(1, Math.round(Math.min(largura, 1100) * zoom));

  // Desenha as páginas visíveis (e as vizinhas) e solta as que ficaram longe.
  const desenhar = useCallback(() => {
    const el = palco.current;
    if (!doc || !el || !largura) return;
    const topo = el.scrollTop, base_ = topo + el.clientHeight;
    const visiveis: number[] = [];
    folhas.current.forEach((f, i) => { if (f && f.offsetTop + f.offsetHeight >= topo && f.offsetTop <= base_) visiveis.push(i + 1); });
    if (!visiveis.length) return;
    // A página "atual" é a que ocupa o meio da tela.
    const meio = topo + el.clientHeight / 2;
    const atual = visiveis.find((n) => { const f = folhas.current[n - 1]!; return f.offsetTop + f.offsetHeight >= meio; }) ?? visiveis[visiveis.length - 1];
    setPagina(atual); setCampo(String(atual));
    const querer = new Set<number>();
    for (let n = Math.max(1, visiveis[0] - PERTO); n <= Math.min(doc.numPages, visiveis[visiveis.length - 1] + PERTO); n++) querer.add(n);
    const chave = `${larguraDaFolha}@${window.devicePixelRatio || 1}`;
    for (const [n, d] of desenhadas.current) {
      if (querer.has(n) && d.chave === chave) continue;
      d.tarefa?.cancel();
      desenhadas.current.delete(n);
      if (!querer.has(n)) folhas.current[n - 1]?.querySelector('canvas')?.remove();
    }
    for (const n of querer) {
      if (desenhadas.current.has(n)) continue;
      const registro: { chave: string; tarefa: Tarefa | null } = { chave, tarefa: null };
      desenhadas.current.set(n, registro);
      void doc.getPage(n).then((p) => {
        const folha = folhas.current[n - 1];
        if (!folha || desenhadas.current.get(n) !== registro) return;
        const natural = p.getViewport({ scale: 1 });
        const proporcao = natural.height / natural.width;
        setProporcoes((atuais) => (Math.abs((atuais[n - 1] ?? 0) - proporcao) > 0.001 ? atuais.map((x, i) => (i === n - 1 ? proporcao : x)) : atuais));
        let escala = (larguraDaFolha / natural.width) * (window.devicePixelRatio || 1);
        const pixels = natural.width * natural.height * escala * escala;
        if (pixels > MAX_PIXELS) escala *= Math.sqrt(MAX_PIXELS / pixels);
        const viewport = p.getViewport({ scale: escala });
        const canvas = document.createElement('canvas');
        canvas.width = Math.floor(viewport.width); canvas.height = Math.floor(viewport.height);
        registro.tarefa = p.render({ canvas, viewport });
        registro.tarefa.promise.then(() => {
          if (desenhadas.current.get(n) !== registro) return;
          folha.querySelector('canvas')?.remove();
          folha.appendChild(canvas);
        }).catch(() => { if (desenhadas.current.get(n) === registro) desenhadas.current.delete(n); });
      }).catch(() => { if (desenhadas.current.get(n) === registro) desenhadas.current.delete(n); });
    }
  }, [doc, largura, larguraDaFolha]);

  useEffect(() => { desenhar(); }, [desenhar, proporcoes]);
  useEffect(() => {
    const mapa = desenhadas.current;
    return () => { for (const d of mapa.values()) d.tarefa?.cancel(); mapa.clear(); };
  }, [doc]);

  const total = doc?.numPages ?? 0;
  const irPara = useCallback((n: number) => {
    if (!total) return;
    const alvo = Math.min(total, Math.max(1, Math.round(n) || 1));
    const f = folhas.current[alvo - 1];
    if (f && palco.current) palco.current.scrollTo({ top: f.offsetTop - MARGEM });
    setPagina(alvo); setCampo(String(alvo));
  }, [total]);

  // Muda o zoom mantendo na tela a mesma altura do documento.
  const zoomPara = useCallback((novo: number) => {
    const el = palco.current;
    const z = Math.min(ZOOMS[ZOOMS.length - 1], Math.max(ZOOMS[0], novo));
    const fracao = el && el.scrollHeight ? el.scrollTop / el.scrollHeight : 0;
    setZoom(z);
    requestAnimationFrame(() => { if (el) el.scrollTop = fracao * el.scrollHeight; });
  }, []);
  const passoDeZoom = (sentido: 1 | -1) => {
    const proximo = sentido > 0 ? ZOOMS.find((z) => z > zoom + 0.001) : [...ZOOMS].reverse().find((z) => z < zoom - 0.001);
    if (proximo) zoomPara(proximo);
  };

  // Ctrl + rodinha (ou pinça no touchpad) muda o zoom do documento, não o da página inteira.
  useEffect(() => {
    const el = palco.current;
    if (!el) return;
    const roda = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      zoomPara(zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1));
    };
    el.addEventListener('wheel', roda, { passive: false });
    return () => el.removeEventListener('wheel', roda);
  }, [zoom, zoomPara]);

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement | null)?.tagName === 'INPUT') return;
      if (e.key === 'PageDown' || e.key === 'ArrowRight') { e.preventDefault(); irPara(pagina + 1); }
      else if (e.key === 'PageUp' || e.key === 'ArrowLeft') { e.preventDefault(); irPara(pagina - 1); }
      else if (e.key === 'Home') { e.preventDefault(); irPara(1); }
      else if (e.key === 'End') { e.preventDefault(); irPara(total); }
      else if (e.key === '+' || e.key === '=') { e.preventDefault(); passoDeZoom(1); }
      else if (e.key === '-') { e.preventDefault(); passoDeZoom(-1); }
      else if (e.key === '0') { e.preventDefault(); zoomPara(1); }
    };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  });

  return (
    <div className="leitor-pdf">
      <div className="leitor-barra" role="toolbar" aria-label="Páginas e zoom">
        <button type="button" className="zoom-btn" onClick={() => irPara(pagina - 1)} disabled={!doc || pagina <= 1} aria-label="Página anterior" title="Página anterior"><Icone nome="voltar" /></button>
        <label className="leitor-pagina">
          <span className="sr-only">Página</span>
          <input inputMode="numeric" value={campo} disabled={!doc} aria-label="Página" onChange={(e) => setCampo(e.target.value.replace(/\D/g, ''))}
            onBlur={() => irPara(Number(campo))} onKeyDown={(e) => { if (e.key === 'Enter') { irPara(Number(campo)); (e.target as HTMLInputElement).blur(); } }} />
          <span aria-hidden="true">de {total || '…'}</span>
        </label>
        <button type="button" className="zoom-btn" onClick={() => irPara(pagina + 1)} disabled={!doc || pagina >= total} aria-label="Próxima página" title="Próxima página"><Icone nome="avancar" /></button>
        <span className="zoom-sep" />
        <button type="button" className="zoom-btn" onClick={() => passoDeZoom(-1)} disabled={!doc || zoom <= ZOOMS[0] + 0.001} aria-label="Afastar" title="Afastar (−)"><Icone nome="zoom-menos" /></button>
        <span className="zoom-porcento" aria-live="polite">{Math.round(zoom * 100)}%</span>
        <button type="button" className="zoom-btn" onClick={() => passoDeZoom(1)} disabled={!doc || zoom >= ZOOMS[ZOOMS.length - 1] - 0.001} aria-label="Aproximar" title="Aproximar (+)"><Icone nome="zoom-mais" /></button>
        <button type="button" className="zoom-btn zoom-texto" onClick={() => zoomPara(1)} disabled={!doc || Math.abs(zoom - 1) < 0.001} title="Ajustar à largura (0)"><Icone nome="ajustar" />Ajustar</button>
      </div>
      <div className="leitor-palco" ref={palco} onScroll={desenhar} tabIndex={0} aria-label={`Páginas de ${nome}`}>
        {erro && <p className="leitor-aviso">Não foi possível mostrar este PDF aqui. Use “Baixar” para abrir no seu computador.</p>}
        {!erro && !doc && <p className="leitor-aviso">Abrindo o PDF…</p>}
        {doc && proporcoes.map((proporcao, i) => (
          <div key={i} className="leitor-folha" ref={(el) => { folhas.current[i] = el; }} aria-label={`Página ${i + 1}`}
            style={{ width: larguraDaFolha, height: Math.round(larguraDaFolha * proporcao) }} />
        ))}
      </div>
    </div>
  );
}
