'use client';
import { useParams, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { Icone } from '@/components/Icone';
import { VoltarAoTopo } from '@/components/VoltarAoTopo';
import { CabecalhoPublico, Indisponivel } from '@/components/publico/CabecalhoPublico';
import { ReferenciadoEm, RicoPublico, VoltarPara } from '@/components/publico/Referencias';
import { textoPuro } from '@/lib/pop/texto-rico';
import { comOrigem } from '@/lib/referencias';
import { ICONE_PROCESSO } from '@/components/SeloProcesso';
import { dataBr, obterProcessoPublico, urlSvg, type ProcessoPublico } from '@/lib/publico';

// Página pública do processo (decisão 35): descrição, fluxograma e os POPs publicados e no ar. É o
// destino das referências a processos e do caminho no topo da página pública do POP.

function ProcessoPublicoPage() {
  const { link } = useParams<{ link: string }>();
  const de = useSearchParams().get('de');
  const [p, setP] = useState<ProcessoPublico | null | undefined>(undefined);
  const [erro, setErro] = useState('');
  const origem = { tipo: 'pr' as const, link };

  useEffect(() => {
    obterProcessoPublico(link)
      .then((d) => { setP(d); document.title = `${d.nome} · Processo`; })
      .catch((e) => { setErro(e instanceof Error && 'status' in e && e.status !== 404 ? 'Não foi possível carregar o processo agora. Tente de novo em instantes.' : ''); setP(null); });
  }, [link]);

  if (p === undefined) return <div className="pub"><CabecalhoPublico /><main className="pub-corpo"><p className="notice">Carregando…</p></main></div>;
  if (p === null) {
    return <Indisponivel titulo={erro ? 'Erro ao carregar' : 'Este processo não está disponível'} mensagem={erro || 'O processo pode ter saído do ar ou o link foi digitado errado. Peça o link atualizado a quem o enviou.'} voltar={de} />;
  }

  const dados: [string, string][] = ([
    ['Código', p.codigo],
    ['Área', p.onde.area],
    ['Organização', p.onde.organizacao],
  ] as [string, string | null][]).filter((x): x is [string, string] => !!x[1]);
  const temDescricao = !!textoPuro(p.descricao);

  return (
    <div className="pub">
      <CabecalhoPublico onde={p.onde} />
      <main className="pub-corpo">
        <VoltarPara de={de} />
        <header className="pub-titulo">
          <span className="pub-tipo"><img src={ICONE_PROCESSO} alt="" width={20} height={20} />Processo</span>
          <h1>{p.nome}</h1>
          <dl className="pub-dados">
            {dados.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
          </dl>
        </header>

        {temDescricao && (
          <section className="pub-secao" id="descricao">
            <h2>Descrição do processo</h2>
            <RicoPublico valor={p.descricao} refs={p.referencias} de={origem} />
          </section>
        )}

        {p.fluxograma && (
          <section className="pub-secao" id="fluxograma">
            <div className="pub-secao-topo">
              <h2>Fluxograma do processo</h2>
              {p.fluxograma.tem_svg && <a className="btn btn-ghost" href={`/f/${p.fluxograma.link_publico}`} target="_blank" rel="noopener"><Icone nome="expandir" tamanho={16} />Abrir só o fluxograma</a>}
            </div>
            {p.fluxograma.tem_svg
              ? <a href={`/f/${p.fluxograma.link_publico}`} target="_blank" rel="noopener" className="pub-fluxo-mini" title="Abrir o fluxograma em tela cheia"><img src={urlSvg(p.fluxograma.link_publico)} alt={`Fluxograma: ${p.fluxograma.nome}`} /></a>
              : <p className="notice">O fluxograma deste processo ainda está sendo preparado para publicação.</p>}
          </section>
        )}

        <section className="pub-secao" id="pops">
          <h2>POPs deste processo</h2>
          {p.pops.length === 0
            ? <p className="notice">Este processo ainda não tem POP publicado.</p>
            : (
              <ol className="pub-pops">
                {p.pops.map((o) => (
                  <li key={o.link_publico}>
                    <a className="pub-pop" href={comOrigem(`/p/${o.link_publico}`, origem)}>
                      <span className="pop-icone"><Icone nome="pop" tamanho={20} /></span>
                      <span className="pub-pop-texto">
                        <strong>{o.identificacao ? `${o.identificacao} · ` : ''}{o.nome}</strong>
                        <span>Versão {o.versao}{o.publicado_em ? ` · publicado em ${dataBr(o.publicado_em)}` : ''}</span>
                      </span>
                      <Icone nome="avancar" tamanho={18} />
                    </a>
                  </li>
                ))}
              </ol>
            )}
        </section>

        {p.referenciado_em.length > 0 && (
          <section className="pub-secao" id="referenciado-em">
            <h2>Referenciado em</h2>
            <ReferenciadoEm itens={p.referenciado_em} href={(x) => (x.url_publica ? comOrigem(x.url_publica, origem) : null)} />
          </section>
        )}

        <footer className="pub-rodape">Publicado com Fluxi</footer>
      </main>
      <VoltarAoTopo />
    </div>
  );
}

export default function Page() {
  return <Suspense><ProcessoPublicoPage /></Suspense>;
}
