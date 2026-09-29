'use client';
import { useEffect, useRef, useState } from 'react';
import { formatarTempo, type SegmentoGravado } from '@/lib/gravacoes';

/** Toca as partes da gravação em sequência, com o tempo contado do início da gravação. */
export function PlayerSegmentos({ segmentos, irPara, marcacoes }: {
  segmentos: SegmentoGravado[];
  irPara: { ms: number; n: number } | null;
  marcacoes: number[];
}) {
  const video = useRef<HTMLVideoElement>(null);
  const [atual, setAtual] = useState(0);
  const [tempo, setTempo] = useState(0);
  const pendente = useRef<{ s: number; tocar: boolean } | null>(null);
  const total = segmentos.reduce((acc, s) => Math.max(acc, s.inicio_ms + s.duracao_ms), 0);

  useEffect(() => {
    if (!irPara || !segmentos.length) return;
    const i = Math.max(0, segmentos.findIndex((s) => irPara.ms >= s.inicio_ms && irPara.ms < s.inicio_ms + s.duracao_ms));
    const s = (irPara.ms - segmentos[i].inicio_ms) / 1000;
    setTempo(irPara.ms);
    if (i === atual && video.current) {
      video.current.currentTime = s;
      void video.current.play();
    } else {
      pendente.current = { s, tocar: true };
      setAtual(i);
    }
  }, [irPara]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!segmentos.length) return <div className="player vazio">O vídeo ainda não foi salvo.</div>;
  const seg = segmentos[atual];

  return (
    <div className="player">
      <video
        ref={video}
        key={seg.caminho}
        src={seg.url ?? undefined}
        controls
        playsInline
        preload="metadata"
        onLoadedMetadata={(e) => {
          const p = pendente.current;
          if (!p) return;
          pendente.current = null;
          e.currentTarget.currentTime = p.s;
          if (p.tocar) void e.currentTarget.play();
        }}
        onTimeUpdate={(e) => setTempo(seg.inicio_ms + e.currentTarget.currentTime * 1000)}
        onSeeked={(e) => setTempo(seg.inicio_ms + e.currentTarget.currentTime * 1000)}
        onEnded={() => {
          if (atual < segmentos.length - 1) {
            pendente.current = { s: 0, tocar: true };
            setAtual(atual + 1);
          }
        }}
      />
      <div className="player-barra">
        <span className="code">{formatarTempo(tempo)} / {formatarTempo(total)}</span>
        {segmentos.length > 1 && <span>Parte {atual + 1} de {segmentos.length}</span>}
      </div>
      {total > 0 && (
        <div className="linha-tempo" aria-hidden="true">
          <span className="linha-progresso" style={{ width: `${(tempo / total) * 100}%` }} />
          {marcacoes.map((m, i) => <span key={i} className="linha-marca" style={{ left: `${(m / total) * 100}%` }} />)}
        </div>
      )}
    </div>
  );
}
