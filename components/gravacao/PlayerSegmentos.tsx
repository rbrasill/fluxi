'use client';
import { useEffect, useRef, useState } from 'react';
import { Icone } from '@/components/Icone';
import { formatarTempo, type SegmentoGravado } from '@/lib/gravacoes';

// Player da gravação (redesign, decisão 83): o vídeo numa moldura índigo escura, com controles próprios no lugar dos
// do navegador. A linha do tempo mostra cada tela marcada como um número: clicar no número leva até a tela. Feito
// com o <video> do navegador, sem biblioteca. A gravação pode ter várias partes (uma a cada 3 minutos, ou uma por
// retomada): elas tocam em sequência e a linha do tempo conta do início da gravação.

type Alvo = { ms: number; tocar: boolean };

export function PlayerSegmentos({ segmentos, irPara, marcacoes }: {
  segmentos: SegmentoGravado[];
  irPara: { ms: number; n: number } | null;
  marcacoes: number[]; // tempo (ms) de cada tela marcada, na ordem das telas
}) {
  const video = useRef<HTMLVideoElement>(null);
  const caixa = useRef<HTMLDivElement>(null);
  const linha = useRef<HTMLDivElement>(null);
  const [atual, setAtual] = useState(0);
  const [tempo, setTempo] = useState(0);
  const [tocando, setTocando] = useState(false);
  const [mudo, setMudo] = useState(false);
  const pendente = useRef<{ s: number; tocar: boolean } | null>(null);
  const total = segmentos.reduce((acc, s) => Math.max(acc, s.inicio_ms + s.duracao_ms), 0);

  /** Vai para um ponto da gravação (tempo contado do início), trocando de parte se for preciso. */
  function ir({ ms, tocar }: Alvo) {
    if (!segmentos.length) return;
    const alvo = Math.min(Math.max(ms, 0), Math.max(total - 1, 0));
    let i = segmentos.findIndex((s) => alvo >= s.inicio_ms && alvo < s.inicio_ms + s.duracao_ms);
    if (i < 0) i = segmentos.findLastIndex((s) => s.inicio_ms <= alvo);
    if (i < 0) i = 0;
    const s = Math.max(0, (alvo - segmentos[i].inicio_ms) / 1000);
    setTempo(alvo);
    if (i === atual && video.current) {
      video.current.currentTime = s;
      if (tocar) void video.current.play().catch(() => {});
    } else {
      pendente.current = { s, tocar };
      setAtual(i);
    }
  }

  useEffect(() => { if (irPara) ir({ ms: irPara.ms, tocar: true }); }, [irPara]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!segmentos.length) return <div className="player vazio">O vídeo ainda não foi salvo.</div>;
  const seg = segmentos[atual];

  function alternar() {
    const v = video.current;
    if (!v) return;
    if (!v.paused) { v.pause(); return; }
    // No fim da gravação, o play recomeça do início.
    if (total > 0 && tempo >= total - 250) ir({ ms: 0, tocar: true });
    else void v.play().catch(() => {});
  }

  function tempoDoPonteiro(clientX: number) {
    const r = linha.current!.getBoundingClientRect();
    return ((clientX - r.left) / Math.max(r.width, 1)) * total;
  }

  function teclado(e: React.KeyboardEvent) {
    const v = video.current;
    if (e.key === 'ArrowRight') { e.preventDefault(); ir({ ms: tempo + 5000, tocar: !!v && !v.paused }); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); ir({ ms: tempo - 5000, tocar: !!v && !v.paused }); }
    else if (e.key === 'Home') { e.preventDefault(); ir({ ms: 0, tocar: false }); }
    else if (e.key === 'End') { e.preventDefault(); ir({ ms: total, tocar: false }); }
  }

  const telaCheia = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void caixa.current?.requestFullscreen?.().catch(() => {});
  };

  return (
    <div className="player" ref={caixa}>
      <div className="player-tela">
        <video
          ref={video}
          key={seg.caminho}
          src={seg.url ?? undefined}
          playsInline
          preload="metadata"
          muted={mudo}
          onClick={alternar}
          onPlay={() => setTocando(true)}
          onPause={() => setTocando(false)}
          onLoadedMetadata={(e) => {
            const p = pendente.current;
            if (!p) return;
            pendente.current = null;
            e.currentTarget.currentTime = p.s;
            if (p.tocar) void e.currentTarget.play().catch(() => {});
          }}
          onTimeUpdate={(e) => setTempo(seg.inicio_ms + e.currentTarget.currentTime * 1000)}
          onSeeked={(e) => setTempo(seg.inicio_ms + e.currentTarget.currentTime * 1000)}
          onEnded={() => {
            if (atual < segmentos.length - 1) {
              pendente.current = { s: 0, tocar: true };
              setAtual(atual + 1);
            } else {
              setTocando(false);
            }
          }}
        />
      </div>

      {total > 0 && (
        <div
          ref={linha}
          className="player-linha"
          role="slider"
          tabIndex={0}
          aria-label="Posição no vídeo"
          aria-valuemin={0}
          aria-valuemax={Math.round(total / 1000)}
          aria-valuenow={Math.round(tempo / 1000)}
          aria-valuetext={`${formatarTempo(tempo)} de ${formatarTempo(total)}`}
          onKeyDown={teclado}
          onPointerDown={(e) => {
            if ((e.target as HTMLElement).closest('.player-marca')) return; // o número tem o próprio clique
            e.currentTarget.setPointerCapture(e.pointerId);
            ir({ ms: tempoDoPonteiro(e.clientX), tocar: tocando });
          }}
          onPointerMove={(e) => { if (e.currentTarget.hasPointerCapture(e.pointerId)) ir({ ms: tempoDoPonteiro(e.clientX), tocar: false }); }}
        >
          <span className="player-trilho"><span className="player-progresso" style={{ width: `${Math.min(100, (tempo / total) * 100)}%` }} /></span>
          {marcacoes.map((m, i) => (
            <button key={i} type="button" className={`player-marca${tempo >= m ? ' passada' : ''}`} style={{ left: `${Math.min(100, (m / total) * 100)}%` }}
              onClick={() => ir({ ms: m, tocar: true })} title={`Tela ${i + 1} · ${formatarTempo(m)}`} aria-label={`Ir para a tela ${i + 1}, em ${formatarTempo(m)}`}>{i + 1}</button>
          ))}
        </div>
      )}

      <div className="player-controles">
        <button type="button" className="player-play" onClick={alternar} aria-label={tocando ? 'Pausar' : 'Tocar'} title={tocando ? 'Pausar' : 'Tocar'}><Icone nome={tocando ? 'pausa' : 'play'} tamanho={18} /></button>
        <span className="player-tempo">{formatarTempo(tempo)} / {formatarTempo(total)}</span>
        {segmentos.length > 1 && <span className="player-parte">Parte {atual + 1} de {segmentos.length}</span>}
        <span className="player-dica">{marcacoes.length > 0 ? 'Clique num número para ir até a tela' : ''}</span>
        <button type="button" className="player-botao" onClick={() => setMudo((m) => !m)} aria-label={mudo ? 'Ligar o som' : 'Desligar o som'} title={mudo ? 'Ligar o som' : 'Desligar o som'} aria-pressed={mudo}><Icone nome={mudo ? 'som-desligado' : 'alto-falante'} tamanho={18} /></button>
        <button type="button" className="player-botao" onClick={telaCheia} aria-label="Tela cheia" title="Tela cheia"><Icone nome="expandir" tamanho={18} /></button>
      </div>
    </div>
  );
}
