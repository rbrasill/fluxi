'use client';
import type Konva from 'konva';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Arrow, Circle, Group, Image as KImage, Label, Layer, Rect, Stage, Tag, Text, Transformer } from 'react-konva';
import { Icone } from '@/components/Icone';
import { confirmar } from '@/components/Dialogos';
import { CORES, COR_PADRAO, anotacoesVazias, espessura, tamanhoBloco, temAnotacao, type Anotacoes, type Forma, type Recorte } from '@/lib/marcacao/anotacoes';

// Editor de marcações sobre o print de uma tela: caixa, seta, número, texto, borrão e recorte.
// As formas ficam em pixels da imagem original; o Stage só é escalado para caber na tela.
// Carregar com next/dynamic (ssr: false): o Konva usa canvas do navegador.

export type ResultadoMarcacao = { anotacoes: Anotacoes; png: Blob; largura: number; altura: number };

type Ferramenta = 'selecionar' | 'caixa' | 'seta' | 'numero' | 'texto' | 'borrar' | 'recortar';

const FERRAMENTAS: { id: Ferramenta; rotulo: string; icone: string; tecla: string; dica: string }[] = [
  { id: 'selecionar', rotulo: 'Selecionar', icone: 'cursor', tecla: 'v', dica: 'Clique numa marcação para mover, ajustar ou excluir.' },
  { id: 'caixa', rotulo: 'Caixa', icone: 'caixa', tecla: 'c', dica: 'Arraste sobre a tela para desenhar a caixa em volta do botão ou campo.' },
  { id: 'seta', rotulo: 'Seta', icone: 'seta', tecla: 's', dica: 'Arraste da base até a ponta: a seta aponta para onde você soltar.' },
  { id: 'numero', rotulo: 'Número', icone: 'numero', tecla: 'n', dica: 'Clique para numerar a ordem dos cliques (1, 2, 3…).' },
  { id: 'texto', rotulo: 'Texto', icone: 'texto', tecla: 't', dica: 'Clique onde quer o texto e digite na barra acima.' },
  { id: 'borrar', rotulo: 'Borrar', icone: 'borrar', tecla: 'b', dica: 'Arraste sobre nomes, CPF, e-mails e outros dados pessoais: a área fica quadriculada no POP.' },
  { id: 'recortar', rotulo: 'Recortar', icone: 'recortar', tecla: 'r', dica: 'Arraste para escolher a parte da tela que vai para o POP.' },
];

const novoId = () => Math.random().toString(36).slice(2, 10);
const normalizar = (x: number, y: number, w: number, h: number) => ({ x: w < 0 ? x + w : x, y: h < 0 ? y + h : y, w: Math.abs(w), h: Math.abs(h) });

/**
 * Quadriculado da área (x, y, w, h) da imagem: reduz a área a poucos pixels (um por quadrado, com a
 * média das cores) e amplia sem suavizar. Do tamanho da área, para sair nítido na imagem final.
 */
function mosaico(img: HTMLImageElement, r: { x: number; y: number; w: number; h: number }, bloco: number) {
  const w = Math.max(1, Math.round(r.w));
  const h = Math.max(1, Math.round(r.h));
  const tela = (cw: number, ch: number) => { const c = document.createElement('canvas'); c.width = cw; c.height = ch; return c; };
  const trecho = tela(w, h);
  trecho.getContext('2d')!.drawImage(img, -r.x, -r.y); // o que cair fora da imagem fica transparente
  const peq = tela(Math.max(1, Math.round(w / bloco)), Math.max(1, Math.round(h / bloco)));
  const p = peq.getContext('2d')!;
  p.imageSmoothingQuality = 'high';
  p.drawImage(trecho, 0, 0, peq.width, peq.height);
  const out = tela(w, h);
  const o = out.getContext('2d')!;
  o.imageSmoothingEnabled = false;
  o.drawImage(peq, 0, 0, w, h);
  return out;
}

export default function EditorMarcacao({ imagemUrl, anotacoes, titulo, aoSalvar, aoFechar }: {
  imagemUrl: string;
  anotacoes: Anotacoes | null;
  titulo?: string;
  aoSalvar: (r: ResultadoMarcacao | null) => Promise<void>;
  aoFechar: () => void;
}) {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [erroImg, setErroImg] = useState(false);
  const [doc, setDoc] = useState<Anotacoes>(() => anotacoes ?? anotacoesVazias());
  const docRef = useRef(doc);
  const passado = useRef<Anotacoes[]>([]);
  const futuro = useRef<Anotacoes[]>([]);
  const [ferramenta, setFerramenta] = useState<Ferramenta>('caixa');
  const [cor, setCor] = useState(COR_PADRAO);
  const [sel, setSel] = useState<string | null>(null);
  const [temp, setTemp] = useState<Forma | Recorte | null>(null);
  const inicio = useRef<{ x: number; y: number } | null>(null);
  const [area, setArea] = useState({ w: 800, h: 500 });
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const areaRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const conteudoRef = useRef<Konva.Layer>(null);
  const trRef = useRef<Konva.Transformer>(null);
  const trRecorteRef = useRef<Konva.Transformer>(null);
  const recorteRef = useRef<Konva.Rect>(null);
  const textoRef = useRef<HTMLInputElement>(null);
  const [, render] = useState(0);
  const mosaicos = useRef(new Map<string, HTMLCanvasElement>());

  // Imagem com CORS liberado (o Storage responde com Access-Control-Allow-Origin), senão o canvas não exporta.
  useEffect(() => {
    const i = new window.Image();
    i.crossOrigin = 'anonymous';
    i.onload = () => setImg(i);
    i.onerror = () => setErroImg(true);
    i.src = imagemUrl;
  }, [imagemUrl]);

  useEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setArea({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const W = img?.naturalWidth ?? 1;
  const H = img?.naturalHeight ?? 1;
  const esc = Math.min(area.w / W, area.h / H, 1);
  const esp = espessura(W);
  const bloco = tamanhoBloco(W);

  // O quadriculado depende só da posição e do tamanho: guarda o último de cada borrão.
  const mosaicoDe = (f: { id: string; x: number; y: number; w: number; h: number }) => {
    const n = normalizar(f.x, f.y, f.w, f.h);
    const chave = `${f.id}:${n.x}:${n.y}:${n.w}:${n.h}`;
    let c = mosaicos.current.get(chave);
    if (!c) {
      for (const k of mosaicos.current.keys()) if (k.startsWith(`${f.id}:`)) mosaicos.current.delete(k);
      c = mosaico(img!, n, bloco);
      mosaicos.current.set(chave, c);
    }
    return { n, c };
  };

  // --- histórico ---
  const aplicar = useCallback((novo: Anotacoes, historico = true) => {
    if (historico) { passado.current.push(docRef.current); futuro.current = []; }
    docRef.current = novo;
    setDoc(novo);
  }, []);
  const marcarHistorico = () => { passado.current.push(docRef.current); futuro.current = []; render((n) => n + 1); };
  const desfazer = useCallback(() => {
    const ant = passado.current.pop();
    if (!ant) return;
    futuro.current.push(docRef.current);
    docRef.current = ant;
    setDoc(ant);
    setSel(null);
  }, []);
  const refazer = useCallback(() => {
    const prox = futuro.current.pop();
    if (!prox) return;
    passado.current.push(docRef.current);
    docRef.current = prox;
    setDoc(prox);
    setSel(null);
  }, []);

  const atualizar = (id: string, dados: Partial<Forma>, historico = true) =>
    aplicar({ ...docRef.current, formas: docRef.current.formas.map((f) => (f.id === id ? ({ ...f, ...dados } as Forma) : f)) }, historico);
  const excluirSel = useCallback(() => {
    if (!sel) return;
    aplicar({ ...docRef.current, formas: docRef.current.formas.filter((f) => f.id !== sel) });
    setSel(null);
  }, [sel, aplicar]);

  const selecionada = doc.formas.find((f) => f.id === sel) ?? null;

  // Transformer: redimensiona a caixa selecionada e o recorte.
  useEffect(() => {
    const tr = trRef.current;
    if (!tr) return;
    const redimensiona = selecionada?.tipo === 'caixa' || selecionada?.tipo === 'borrar';
    const no = redimensiona && ferramenta !== 'recortar' ? stageRef.current?.findOne(`#${selecionada.id}`) : null;
    tr.nodes(no ? [no] : []);
    tr.getLayer()?.batchDraw();
  }, [selecionada, ferramenta, doc]);
  useEffect(() => {
    const tr = trRecorteRef.current;
    if (!tr) return;
    tr.nodes(ferramenta === 'recortar' && doc.recorte && recorteRef.current ? [recorteRef.current] : []);
    tr.getLayer()?.batchDraw();
  }, [ferramenta, doc.recorte]);

  // --- teclado ---
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      const digitando = (e.target as HTMLElement)?.tagName === 'INPUT';
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); return e.shiftKey ? refazer() : desfazer(); }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); return refazer(); }
      if (digitando) return;
      if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); return excluirSel(); }
      if (e.key === 'Escape') return setSel(null);
      const f = FERRAMENTAS.find((x) => x.tecla === e.key.toLowerCase());
      if (f && !e.ctrlKey && !e.metaKey && !e.altKey) setFerramenta(f.id);
    };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [desfazer, refazer, excluirSel]);

  // --- desenho ---
  const ponto = () => {
    const p = stageRef.current?.getPointerPosition();
    if (!p) return null;
    return { x: Math.max(0, Math.min(W, p.x / esc)), y: Math.max(0, Math.min(H, p.y / esc)) };
  };

  function aoPressionar(e: Konva.KonvaEventObject<PointerEvent>) {
    const fundo = e.target === e.target.getStage() || e.target.name() === 'fundo';
    if (!fundo) return; // clique numa marcação: ela mesma trata (seleciona/arrasta)
    const p = ponto();
    if (!p) return;
    setSel(null);
    if (ferramenta === 'numero') {
      const n = Math.max(0, ...docRef.current.formas.map((f) => (f.tipo === 'numero' ? f.n : 0))) + 1;
      const f: Forma = { id: novoId(), tipo: 'numero', x: p.x, y: p.y, n: Math.min(n, 99), cor };
      aplicar({ ...docRef.current, formas: [...docRef.current.formas, f] });
      return setSel(f.id);
    }
    if (ferramenta === 'texto') {
      const f: Forma = { id: novoId(), tipo: 'texto', x: p.x, y: p.y, texto: 'Clique aqui', cor };
      aplicar({ ...docRef.current, formas: [...docRef.current.formas, f] });
      setSel(f.id);
      setFerramenta('selecionar'); // evita criar outro texto num clique sem querer
      setTimeout(() => { textoRef.current?.focus(); textoRef.current?.select(); }, 0);
      return;
    }
    if (ferramenta === 'caixa') setTemp({ id: novoId(), tipo: 'caixa', x: p.x, y: p.y, w: 0, h: 0, cor });
    if (ferramenta === 'borrar') setTemp({ id: novoId(), tipo: 'borrar', x: p.x, y: p.y, w: 0, h: 0 });
    if (ferramenta === 'seta') setTemp({ id: novoId(), tipo: 'seta', x1: p.x, y1: p.y, x2: p.x, y2: p.y, cor });
    if (ferramenta === 'recortar') setTemp({ x: p.x, y: p.y, w: 0, h: 0 });
    inicio.current = p;
  }

  function aoMover() {
    if (!temp || !inicio.current) return;
    const p = ponto();
    if (!p) return;
    const i = inicio.current;
    if ('tipo' in temp && temp.tipo === 'seta') setTemp({ ...temp, x2: p.x, y2: p.y });
    else setTemp({ ...temp, w: p.x - i.x, h: p.y - i.y } as Forma | Recorte);
  }

  function aoSoltar() {
    const t = temp;
    setTemp(null);
    inicio.current = null;
    if (!t) return;
    const minimo = 6 / esc;
    if ('tipo' in t && t.tipo === 'seta') {
      if (Math.hypot(t.x2 - t.x1, t.y2 - t.y1) < minimo * 2) return;
      aplicar({ ...docRef.current, formas: [...docRef.current.formas, t] });
      return setSel(t.id);
    }
    const r = t as { x: number; y: number; w: number; h: number };
    const n = normalizar(r.x, r.y, r.w, r.h);
    if (n.w < minimo || n.h < minimo) return;
    if ('tipo' in t) {
      const f = { ...t, ...n } as Forma;
      aplicar({ ...docRef.current, formas: [...docRef.current.formas, f] });
      return setSel(f.id);
    }
    aplicar({ ...docRef.current, recorte: n });
  }

  const limitarRecorte = (r: Recorte): Recorte => {
    const x = Math.max(0, Math.min(r.x, W - 10));
    const y = Math.max(0, Math.min(r.y, H - 10));
    return { x, y, w: Math.max(10, Math.min(r.w, W - x)), h: Math.max(10, Math.min(r.h, H - y)) };
  };

  // --- salvar ---
  async function salvar() {
    setErro('');
    setSalvando(true);
    try {
      const d = docRef.current;
      if (!temAnotacao(d)) {
        await aoSalvar(null);
        return;
      }
      setSel(null);
      const r = d.recorte ?? { x: 0, y: 0, w: W, h: H };
      const camada = conteudoRef.current!;
      const canvas = camada.toCanvas({ x: r.x * esc, y: r.y * esc, width: r.w * esc, height: r.h * esc, pixelRatio: 1 / esc });
      const png = await new Promise<Blob>((ok, falha) => canvas.toBlob((b) => (b ? ok(b) : falha(new Error('Falha ao gerar a imagem'))), 'image/png'));
      await aoSalvar({ anotacoes: d, png, largura: canvas.width, altura: canvas.height });
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível salvar.');
      setSalvando(false);
    }
  }

  async function fechar() {
    if (passado.current.length && !(await confirmar({ titulo: 'Descartar as marcações feitas agora?', mensagem: 'O que foi desenhado desde que você abriu esta tela não será salvo.', acao: 'Descartar', perigo: true }))) return;
    aoFechar();
  }

  function trocarCor(c: string) {
    setCor(c);
    if (selecionada && selecionada.tipo !== 'borrar') atualizar(selecionada.id, { cor: c });
  }

  // --- formas ---
  const comum = (f: Forma) => ({
    id: f.id,
    draggable: ferramenta !== 'recortar',
    onPointerDown: (e: Konva.KonvaEventObject<PointerEvent>) => { e.cancelBubble = true; setSel(f.id); },
    onDragStart: () => { marcarHistorico(); setSel(f.id); },
  });

  function desenhar(f: Forma, provisoria = false) {
    const c = provisoria ? {} : comum(f);
    switch (f.tipo) {
      case 'caixa': {
        const n = normalizar(f.x, f.y, f.w, f.h);
        return (
          <Rect key={f.id} {...c} x={n.x} y={n.y} width={n.w} height={n.h} stroke={f.cor} strokeWidth={esp} cornerRadius={esp} strokeScaleEnabled={false} hitStrokeWidth={esp * 5}
            onDragEnd={(e) => atualizar(f.id, { x: e.target.x(), y: e.target.y() }, false)}
            onTransformStart={marcarHistorico}
            onTransformEnd={(e) => {
              const no = e.target;
              const w = Math.max(5, no.width() * no.scaleX());
              const h = Math.max(5, no.height() * no.scaleY());
              no.scaleX(1); no.scaleY(1);
              atualizar(f.id, { x: no.x(), y: no.y(), w, h }, false);
            }} />
        );
      }
      case 'seta':
        return (
          <Arrow key={f.id} {...c} points={[f.x1, f.y1, f.x2, f.y2]} stroke={f.cor} fill={f.cor} strokeWidth={esp} pointerLength={esp * 3.6} pointerWidth={esp * 3.6}
            lineCap="round" lineJoin="round" hitStrokeWidth={esp * 5}
            onDragEnd={(e) => {
              const dx = e.target.x(), dy = e.target.y();
              e.target.position({ x: 0, y: 0 });
              atualizar(f.id, { x1: f.x1 + dx, y1: f.y1 + dy, x2: f.x2 + dx, y2: f.y2 + dy }, false);
            }} />
        );
      case 'numero': {
        const r = esp * 4.5;
        return (
          <Group key={f.id} {...c} x={f.x} y={f.y} onDragEnd={(e) => atualizar(f.id, { x: e.target.x(), y: e.target.y() }, false)}>
            <Circle radius={r} fill={f.cor} stroke="#fff" strokeWidth={esp * 0.6} shadowColor="#000" shadowOpacity={0.25} shadowBlur={esp} />
            <Text text={String(f.n)} fontSize={r * 1.15} fontStyle="bold" fontFamily="Arial, sans-serif" fill="#fff" width={r * 2} height={r * 2} x={-r} y={-r} align="center" verticalAlign="middle" />
          </Group>
        );
      }
      case 'borrar': {
        const { n, c: canvas } = mosaicoDe(f);
        return (
          <KImage key={f.id} {...c} image={canvas} x={n.x} y={n.y} width={n.w} height={n.h}
            onDragEnd={(e) => atualizar(f.id, { x: e.target.x(), y: e.target.y() }, false)}
            onTransformStart={marcarHistorico}
            onTransformEnd={(e) => {
              const no = e.target;
              const w = Math.max(5, no.width() * no.scaleX());
              const h = Math.max(5, no.height() * no.scaleY());
              no.scaleX(1); no.scaleY(1);
              atualizar(f.id, { x: no.x(), y: no.y(), w, h }, false);
            }} />
        );
      }
      case 'texto':
        return (
          <Label key={f.id} {...c} x={f.x} y={f.y} onDragEnd={(e) => atualizar(f.id, { x: e.target.x(), y: e.target.y() }, false)}>
            <Tag fill="rgba(255,255,255,0.94)" stroke={f.cor} strokeWidth={esp * 0.5} cornerRadius={esp} shadowColor="#000" shadowOpacity={0.15} shadowBlur={esp} />
            <Text text={f.texto || ' '} fontSize={esp * 4.4} fontStyle="bold" fontFamily="Arial, sans-serif" fill={f.cor} padding={esp * 1.6} />
          </Label>
        );
    }
  }

  const rec = temp && !('tipo' in temp) ? normalizar(temp.x, temp.y, temp.w, temp.h) : doc.recorte;
  const dicaAtual = FERRAMENTAS.find((f) => f.id === ferramenta)!.dica;

  return (
    <div className="editor-marcacao" role="dialog" aria-modal="true" aria-label="Marcar tela">
      <div className="em-barra">
        <strong className="em-titulo">{titulo ?? 'Marcar tela'}</strong>
        <div className="em-grupo" role="toolbar" aria-label="Ferramentas">
          {FERRAMENTAS.map((f) => (
            <button key={f.id} className="em-ferr" aria-pressed={ferramenta === f.id} onClick={() => { setFerramenta(f.id); if (f.id === 'recortar') setSel(null); }} title={`${f.rotulo} (${f.tecla.toUpperCase()})`}>
              <Icone nome={f.icone} tamanho={18} /><span>{f.rotulo}</span>
            </button>
          ))}
        </div>
        <div className="em-grupo" aria-label="Cor">
          {CORES.map((c) => (
            <button key={c} className="em-cor" style={{ background: c }} aria-pressed={(selecionada && 'cor' in selecionada ? selecionada.cor : cor) === c} aria-label={`Cor ${c}`} onClick={() => trocarCor(c)} />
          ))}
        </div>
        <div className="em-grupo">
          <button className="btn btn-ghost btn-icon" onClick={desfazer} disabled={!passado.current.length} title="Desfazer (Ctrl+Z)" aria-label="Desfazer"><Icone nome="desfazer" tamanho={18} /></button>
          <button className="btn btn-ghost btn-icon" onClick={refazer} disabled={!futuro.current.length} title="Refazer (Ctrl+Shift+Z)" aria-label="Refazer"><Icone nome="refazer" tamanho={18} /></button>
          <button className="btn btn-ghost btn-icon" onClick={excluirSel} disabled={!sel} title="Excluir marcação (Delete)" aria-label="Excluir marcação"><Icone nome="lixo" tamanho={18} /></button>
        </div>
        <div className="em-acoes">
          <button className="btn" onClick={fechar} disabled={salvando}>Cancelar</button>
          <button className="btn btn-primary" onClick={salvar} disabled={salvando || !img}>{salvando ? 'Salvando…' : 'Salvar'}</button>
        </div>
      </div>

      <div className="em-sub">
        {selecionada?.tipo === 'texto' ? (
          <label className="em-campo">Texto
            <input ref={textoRef} value={selecionada.texto} maxLength={200} onFocus={marcarHistorico}
              onChange={(e) => atualizar(selecionada.id, { texto: e.target.value }, false)} />
          </label>
        ) : selecionada?.tipo === 'numero' ? (
          <label className="em-campo">Número
            <input type="number" min={1} max={99} value={selecionada.n} onFocus={marcarHistorico}
              onChange={(e) => { const n = Number(e.target.value); if (n >= 1 && n <= 99) atualizar(selecionada.id, { n }, false); }} />
          </label>
        ) : (
          <span>{dicaAtual}</span>
        )}
        {doc.recorte && (
          <button className="btn btn-ghost" onClick={() => aplicar({ ...docRef.current, recorte: null })}>Desfazer recorte</button>
        )}
        {temAnotacao(doc) && (
          <button className="btn btn-ghost" onClick={() => { aplicar(anotacoesVazias()); setSel(null); }}>Limpar tudo</button>
        )}
        {erro && <span className="form-erro" role="alert">{erro}</span>}
      </div>

      <div className="em-area" ref={areaRef}>
        {erroImg && <p className="notice">Não foi possível carregar a imagem desta tela.</p>}
        {!img && !erroImg && <p className="notice">Carregando a tela…</p>}
        {img && (
          <Stage ref={stageRef} width={W * esc} height={H * esc} scaleX={esc} scaleY={esc}
            className={`em-stage ferr-${ferramenta}`}
            onPointerDown={aoPressionar} onPointerMove={aoMover} onPointerUp={aoSoltar} onPointerLeave={() => temp && aoSoltar()}>
            <Layer ref={conteudoRef} listening={ferramenta !== 'recortar'}>
              <KImage image={img} width={W} height={H} name="fundo" />
              {/* Borrões logo acima do print: setas e caixas continuam visíveis por cima deles. */}
              {doc.formas.filter((f) => f.tipo === 'borrar').map((f) => desenhar(f))}
              {doc.formas.filter((f) => f.tipo !== 'borrar').map((f) => desenhar(f))}
              {temp && 'tipo' in temp && desenhar(temp, true)}
            </Layer>
            <Layer>
              {rec && (
                <>
                  {/* área fora do recorte escurecida */}
                  <Rect x={0} y={0} width={W} height={rec.y} fill="#000" opacity={0.5} listening={false} />
                  <Rect x={0} y={rec.y + rec.h} width={W} height={H - rec.y - rec.h} fill="#000" opacity={0.5} listening={false} />
                  <Rect x={0} y={rec.y} width={rec.x} height={rec.h} fill="#000" opacity={0.5} listening={false} />
                  <Rect x={rec.x + rec.w} y={rec.y} width={W - rec.x - rec.w} height={rec.h} fill="#000" opacity={0.5} listening={false} />
                </>
              )}
              {ferramenta === 'recortar' && doc.recorte && !temp && (
                <Rect ref={recorteRef} x={doc.recorte.x} y={doc.recorte.y} width={doc.recorte.w} height={doc.recorte.h}
                  stroke="#fff" strokeWidth={2} dash={[8, 6]} strokeScaleEnabled={false} draggable
                  onPointerDown={(e) => { e.cancelBubble = true; }}
                  onDragStart={marcarHistorico}
                  onDragEnd={(e) => aplicar({ ...docRef.current, recorte: limitarRecorte({ ...docRef.current.recorte!, x: e.target.x(), y: e.target.y() }) }, false)}
                  onTransformStart={marcarHistorico}
                  onTransformEnd={(e) => {
                    const no = e.target;
                    const r = limitarRecorte({ x: no.x(), y: no.y(), w: no.width() * no.scaleX(), h: no.height() * no.scaleY() });
                    no.scaleX(1); no.scaleY(1);
                    aplicar({ ...docRef.current, recorte: r }, false);
                  }} />
              )}
              {selecionada?.tipo === 'seta' && ferramenta !== 'recortar' && (['1', '2'] as const).map((k) => (
                <Circle key={k} x={k === '1' ? selecionada.x1 : selecionada.x2} y={k === '1' ? selecionada.y1 : selecionada.y2}
                  radius={7 / esc} fill="#fff" stroke="#005f73" strokeWidth={2 / esc} draggable
                  onPointerDown={(e) => { e.cancelBubble = true; }}
                  onDragStart={marcarHistorico}
                  onDragMove={(e) => atualizar(selecionada.id, k === '1' ? { x1: e.target.x(), y1: e.target.y() } : { x2: e.target.x(), y2: e.target.y() }, false)} />
              ))}
              <Transformer ref={trRef} rotateEnabled={false} ignoreStroke keepRatio={false} borderStroke="#005f73" anchorStroke="#005f73" anchorSize={9} />
              <Transformer ref={trRecorteRef} rotateEnabled={false} ignoreStroke keepRatio={false} borderEnabled={false} anchorStroke="#fff" anchorFill="#005f73" anchorSize={10} />
            </Layer>
          </Stage>
        )}
      </div>
    </div>
  );
}
