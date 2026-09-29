'use client';
import { useEffect, useRef } from 'react';
import { Icone } from '@/components/Icone';
import { formatarTempo } from '@/lib/gravacoes';

export type PropsPainel = {
  tempoMs: number;
  pausado: boolean;
  totalTelas: number;
  enviando: number;
  instrucao: string;
  aoMudarInstrucao: (v: string) => void;
  aoMarcar: () => void;
  aoPausar: () => void;
  aoRetomar: () => void;
  aoEncerrar: () => void;
  flash: number; // muda a cada tela incluída (animação de confirmação)
  previa?: MediaStream;
  flutuante?: boolean;
  telaInteira?: boolean;
};

export function PainelGravacao(p: PropsPainel) {
  const video = useRef<HTMLVideoElement>(null);
  const botao = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (video.current && p.previa && video.current.srcObject !== p.previa) video.current.srcObject = p.previa;
  }, [p.previa]);

  useEffect(() => {
    if (p.flutuante) botao.current?.focus();
  }, [p.flutuante]);

  return (
    <div className={`painel-grav ${p.flutuante ? 'flutuante' : ''}`}>
      <div className="painel-topo">
        <span className={`rec ${p.pausado ? 'pausado' : ''}`}><span className="rec-dot" />{p.pausado ? 'PAUSADO' : 'REC'}</span>
        <span className="rec-tempo">{formatarTempo(p.tempoMs)}</span>
        <span className="painel-acoes">
          {p.pausado ? (
            <button type="button" className="btn btn-icon" onClick={p.aoRetomar} aria-label="Retomar" title="Retomar"><Icone nome="play" /></button>
          ) : (
            <button type="button" className="btn btn-icon" onClick={p.aoPausar} aria-label="Pausar" title="Pausar"><Icone nome="pausa" /></button>
          )}
          <button type="button" className="btn btn-parar" onClick={p.aoEncerrar}><Icone nome="parar" tamanho={14} />Encerrar</button>
        </span>
      </div>

      {p.previa && (
        <div className="painel-previa">
          <video ref={video} autoPlay muted playsInline />
          <span key={p.flash} className={p.flash ? 'flash' : ''} />
        </div>
      )}

      <form
        className="painel-marcar"
        onSubmit={(e) => {
          e.preventDefault();
          p.aoMarcar();
        }}
      >
        <button ref={botao} type="submit" className="btn-marcar">
          <Icone nome="camera" tamanho={20} />Incluir esta tela no POP
        </button>
        <input
          value={p.instrucao}
          onChange={(e) => p.aoMudarInstrucao(e.target.value)}
          placeholder="Instrução (opcional). Enter inclui a tela"
          aria-label="Instrução para esta tela"
        />
      </form>

      {p.flutuante && p.telaInteira && (
        <p className="painel-aviso">Você está gravando a tela inteira, então esta janelinha aparece nos prints. Arraste-a para um canto ou grave só a janela do sistema.</p>
      )}

      <div className="painel-rodape">
        <span key={p.totalTelas} className="contador">{p.totalTelas} {p.totalTelas === 1 ? 'tela marcada' : 'telas marcadas'}</span>
        {p.enviando > 0 && <span className="enviando"><span className="spinner" />enviando {p.enviando}</span>}
      </div>
    </div>
  );
}
