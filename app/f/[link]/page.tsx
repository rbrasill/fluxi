'use client';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Icone } from '@/components/Icone';
import { CabecalhoPublico, Indisponivel } from '@/components/publico/CabecalhoPublico';
import { dataBr, obterFluxogramaPublico, urlSvg, type FluxogramaPublico } from '@/lib/publico';

// Página pública só do fluxograma do processo (decisão 32): é para onde o "Abrir diagrama" do PDF
// leva. O desenho é o SVG exportado pelo editor: vetor (nítido em qualquer zoom) e com a
// animação das setas.

export default function FluxogramaPublicoPage() {
  const { link } = useParams<{ link: string }>();
  const [f, setF] = useState<FluxogramaPublico | null | undefined>(undefined);
  const [erro, setErro] = useState('');
  const [tamanhoReal, setTamanhoReal] = useState(false);

  useEffect(() => {
    obterFluxogramaPublico(link)
      .then((d) => { setF(d); document.title = `${d.onde.processo ?? d.nome} · Fluxograma`; })
      .catch((e) => { setErro(e instanceof Error && 'status' in e && e.status !== 404 ? 'Não foi possível carregar o fluxograma agora. Tente de novo em instantes.' : ''); setF(null); });
  }, [link]);

  if (f === undefined) return <div className="pub"><CabecalhoPublico /><main className="pub-corpo"><p className="notice">Carregando…</p></main></div>;
  if (f === null) {
    return <Indisponivel titulo={erro ? 'Erro ao carregar' : 'Este fluxograma não está disponível'} mensagem={erro || 'O processo pode ter sido arquivado ou o link foi digitado errado. Peça o link atualizado a quem o enviou.'} />;
  }

  return (
    <div className="pub pub-so-fluxo">
      <CabecalhoPublico onde={f.onde} />
      <div className="pub-fluxo-barra">
        <div>
          <span className="pub-tipo">Fluxograma do processo</span>
          <h1>{f.onde.processo ?? f.nome}</h1>
          <span className="notice">Atualizado em {dataBr(f.atualizado_em)}</span>
        </div>
        {f.tem_svg && (
          <div className="pub-acoes">
            <button type="button" className="btn" onClick={() => setTamanhoReal(!tamanhoReal)} aria-pressed={tamanhoReal}>
              <Icone nome={tamanhoReal ? 'ajustar' : 'expandir'} tamanho={16} />{tamanhoReal ? 'Ajustar à tela' : 'Tamanho real'}
            </button>
            <a className="btn btn-ghost" href={urlSvg(link)} download={`${f.onde.processo ?? f.nome}.svg`}><Icone nome="baixar" tamanho={16} />SVG</a>
          </div>
        )}
      </div>
      {f.tem_svg
        ? <div className={`pub-fluxo-area ${tamanhoReal ? 'real' : ''}`}><img src={urlSvg(link)} alt={`Fluxograma: ${f.onde.processo ?? f.nome}`} /></div>
        : <main className="pub-corpo"><p className="notice">O fluxograma deste processo ainda está sendo preparado para publicação.</p></main>}
    </div>
  );
}
