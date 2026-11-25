'use client';
import { useState } from 'react';
import { Icone } from '@/components/Icone';
import { ReferenciadoEm, RicoPublico } from '@/components/publico/Referencias';
import { VisualizadorImagens, type ImagemAmpliavel } from '@/components/publico/VisualizadorImagens';
import { ICONE_DOC } from '@/components/SeloDocumento';
import { textoPuro } from '@/lib/pop/texto-rico';
import { comOrigem } from '@/lib/referencias';
import { dataBr, urlSvg, type PopPublico } from '@/lib/publico';

// O documento do POP como foi publicado, só leitura: título, dados, objetivo, envolvidos, fluxograma, procedimentos com
// os prints e o histórico de revisões. É o corpo da página pública (decisão 32) e da leitura de uma versão antiga
// dentro do app (decisão 138).

export function DocumentoDoPop({ pop, origem, pdf }: {
  pop: PopPublico;
  /** A página pública de onde as referências saem (para o "Voltar para…" do destino); nula dentro do app. */
  origem: { tipo: 'p'; link: string } | null;
  /** Endereço do PDF desta versão. */
  pdf: string;
}) {
  const [ampliada, setAmpliada] = useState<number | null>(null); // índice em `prints`
  const c = pop.conteudo;
  const fluxo = pop.fluxograma;
  const Rico = ({ valor }: { valor: string }) => <RicoPublico valor={valor} refs={pop.referencias} de={origem} />;
  const envolvidos = c.envolvidos.filter((e) => e.area || e.cargo);
  // Todos os prints, na ordem do POP: o visualizador passa de um para o outro.
  const prints: ImagemAmpliavel[] = [];
  const indicePrint = new Map<string, number>();
  c.procedimentos.forEach((p, i) => p.passos.forEach((s, k) => {
    const src = s.imagem_caminho ? pop.imagens[s.imagem_caminho] : undefined;
    if (!src) return;
    indicePrint.set(`${i}-${k}`, prints.length);
    prints.push({ src, alt: `Tela do passo ${k + 1} de ${p.nome || `Procedimento ${i + 1}`}`, legenda: `${p.nome || `Procedimento ${i + 1}`} · Passo ${k + 1}` });
  }));
  const dados: [string, string][] = ([
    ['Identificação', pop.identificacao],
    ['Versão', pop.versao],
    ['Código do processo', pop.codigo],
    ['Área', c.area],
    ['Executor do processo', c.executor],
    ['Elaborado por', pop.autor],
    ['Publicado em', dataBr(pop.publicado_em)],
  ] as [string, string][]).filter(([, v]) => v);

  return (
    <>
        <header className="pub-titulo">
          <span className="pub-tipo"><img src={ICONE_DOC.pop} alt="" width={20} height={20} />Procedimento Operacional Padrão</span>
          <h1>{pop.nome}</h1>
          <dl className="pub-dados">
            {dados.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
          </dl>
          <div className="pub-acoes">
            <a className="btn btn-primary" href={pdf}><Icone nome="baixar" tamanho={16} />Baixar PDF</a>
          </div>
        </header>

        {c.procedimentos.length > 1 && (
          <nav className="pub-indice" aria-label="Neste POP">
            <strong>Neste POP</strong>
            <ol>
              {textoPuro(c.objetivo) && <li><a href="#objetivo">Objetivo</a></li>}
              {fluxo && <li><a href="#fluxograma">Fluxograma do processo</a></li>}
              {c.procedimentos.map((p, i) => <li key={i}><a href={`#procedimento-${i + 1}`}>{p.nome || `Procedimento ${i + 1}`}</a></li>)}
              {pop.referenciado_em.length > 0 && <li><a href="#referenciado-em">Referenciado em</a></li>}
            </ol>
          </nav>
        )}

        {textoPuro(c.objetivo) && (
          <section className="pub-secao" id="objetivo">
            <h2>Objetivo do POP (Procedimento Operacional Padrão)</h2>
            <Rico valor={c.objetivo} />
          </section>
        )}

        {envolvidos.length > 0 && (
          <section className="pub-secao" id="envolvidos">
            <h2>Envolvidos</h2>
            <ul className="pub-envolvidos">{envolvidos.map((e, i) => <li key={i}><b>{e.area}</b>{e.area && e.cargo ? ' · ' : ''}{e.cargo}</li>)}</ul>
          </section>
        )}

        {fluxo && (
          <section className="pub-secao" id="fluxograma">
            <div className="pub-secao-topo">
              <h2>Fluxograma do processo</h2>
              {fluxo.tem_svg && <a className="btn btn-ghost" href={`/f/${fluxo.link_publico}`} target="_blank" rel="noopener"><Icone nome="expandir" tamanho={16} />Abrir só o fluxograma</a>}
            </div>
            {fluxo.tem_svg
              ? <a href={`/f/${fluxo.link_publico}`} target="_blank" rel="noopener" className="pub-fluxo-mini" title="Abrir o fluxograma em tela cheia"><img src={urlSvg(fluxo.link_publico)} alt={`Fluxograma: ${fluxo.nome}`} /></a>
              : <p className="notice">O fluxograma deste processo ainda está sendo preparado para publicação.</p>}
          </section>
        )}

        {c.procedimentos.map((p, i) => (
          <section key={i} className="pub-secao" id={`procedimento-${i + 1}`}>
            <h2><span className="num">{i + 1}</span>{p.nome || `Procedimento ${i + 1}`}</h2>
            <ol className="pub-passos">
              {p.passos.map((s, k) => (
                <li key={k} className="pub-passo">
                  <span className="pub-passo-num">{k + 1}</span>
                  <div className="pub-passo-corpo">
                    {textoPuro(s.texto) && <Rico valor={s.texto} />}
                    {s.imagem_caminho && pop.imagens[s.imagem_caminho] && (
                      <button type="button" className="pub-print-botao" onClick={() => setAmpliada(indicePrint.get(`${i}-${k}`) ?? null)}
                        aria-label={`Ampliar a tela do passo ${k + 1}`} title="Clique para ampliar">
                        <img className="pub-print" src={pop.imagens[s.imagem_caminho]} alt={`Tela do passo ${k + 1}`} loading="lazy"
                          width={s.imagem_largura} height={s.imagem_altura} />
                        <span className="pub-print-zoom" aria-hidden="true"><Icone nome="zoom-mais" tamanho={16} />Ampliar</span>
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          </section>
        ))}

        {pop.referenciado_em.length > 0 && (
          <section className="pub-secao" id="referenciado-em">
            <h2>Referenciado em</h2>
            <ReferenciadoEm itens={pop.referenciado_em} href={(x) => (x.url_publica ? comOrigem(x.url_publica, origem) : null)} />
          </section>
        )}

        {pop.historico.length > 0 && (
          <section className="pub-secao" id="historico">
            <h2>Histórico de revisões</h2>
            <table className="pub-tabela">
              <thead><tr><th>Data</th><th>Elaborado por</th><th>Revisão</th></tr></thead>
              <tbody>{pop.historico.map((h, i) => <tr key={i}><td>{h.data}</td><td>{h.elaborado_por}</td><td>{h.revisao}</td></tr>)}</tbody>
            </table>
          </section>
        )}

      {ampliada !== null && prints[ampliada] && <VisualizadorImagens imagens={prints} inicial={ampliada} aoFechar={() => setAmpliada(null)} />}
    </>
  );
}
