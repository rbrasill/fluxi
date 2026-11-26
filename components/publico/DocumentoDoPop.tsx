'use client';
import { useState, type ReactNode } from 'react';
import { IconeDoArquivo } from '@/components/arquivos/Pecas';
import { VisualizadorDeArquivo } from '@/components/arquivos/VisualizadorDeArquivo';
import { Icone } from '@/components/Icone';
import { ReferenciadoEm, RicoPublico } from '@/components/publico/Referencias';
import { VisualizadorImagens, type ImagemAmpliavel } from '@/components/publico/VisualizadorImagens';
import { dataBr as diaBr, formatoDe, tamanhoLegivel, type Abertura, type ArquivoPublico } from '@/lib/anexos';
import { MESES, arquivosGerais, etapasDoDocumento } from '@/lib/pop/documento';
import { textoPuro } from '@/lib/pop/texto-rico';
import { comOrigem } from '@/lib/referencias';
import { dataBr, urlSvg, type PopPublico } from '@/lib/publico';

// O documento do POP como foi publicado, só leitura (decisão 140): o cabeçalho com a logo, a ficha do procedimento, o
// objetivo, os envolvidos, os recursos, os procedimentos (cada passo num cartão numerado, com o print em cima e o
// texto embaixo), os arquivos da versão (decisão 141: os de cada etapa dentro dela, os gerais nos recursos) e o
// histórico de revisões. É o corpo da página pública (decisão 32) e da leitura de uma versão antiga
// dentro do app (decisão 138). O PDF segue o mesmo desenho (`lib/pop/pdf.ts`).

/** Os ícones dos títulos das seções (traço, 24×24). */
const ICONES = {
  procedimento: <><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1" /></>,
  objetivo: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="4.5" /></>,
  envolvidos: <><circle cx="8" cy="8" r="3" /><circle cx="17" cy="9" r="2.5" /><path d="M2.5 20c0-3.3 2.5-6 5.5-6s5.5 2.7 5.5 6M15 14.5c3 0 6.5 1.5 6.5 5.5" /></>,
  recursos: <><rect x="4" y="3" width="16" height="7" rx="1" /><rect x="4" y="14" width="16" height="7" rx="1" /><path d="M12 10v4" /></>,
  procedimentos: <path d="M9 11V5.5a1.5 1.5 0 013 0V11m0-1.5a1.5 1.5 0 013 0V11m0-.5a1.5 1.5 0 013 0V15a6 6 0 01-6 6h-1a6 6 0 01-5-2.7L4 14.5a1.6 1.6 0 012.6-1.8L9 15" />,
  referencias: <><path d="M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1" /><path d="M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1" /></>,
  historico: <><path d="M3 12a9 9 0 109-9 9 9 0 00-6.4 2.6L3 8" /><path d="M3 3v5h5M12 7v5l3 2" /></>,
};

function Secao({ id, icone, titulo, children }: { id: string; icone: keyof typeof ICONES; titulo: string; children: ReactNode }) {
  return (
    <section className="docpop-secao" id={id} aria-labelledby={`${id}-titulo`}>
      <h2 id={`${id}-titulo`}><svg viewBox="0 0 24 24" aria-hidden="true">{ICONES[icone]}</svg>{titulo}</h2>
      {children}
    </section>
  );
}

/** Um arquivo do POP na leitura (decisão 141): o que é, até quando vale e o botão que abre o visualizador. */
function ArquivoNaLeitura({ arquivo, aoAbrir }: { arquivo: ArquivoPublico; aoAbrir: () => void }) {
  return (
    <li className="docpop-arquivo">
      <IconeDoArquivo arquivo={arquivo} />
      <div className="docpop-arquivo-texto">
        <strong>{arquivo.descricao || arquivo.nome}</strong>
        <span>{arquivo.nome} · {formatoDe(arquivo)} · {tamanhoLegivel(arquivo.tamanho)}{arquivo.validade ? ` · válido até ${diaBr(arquivo.validade)}` : ''}</span>
      </div>
      <button type="button" className="docpop-pilula" onClick={aoAbrir} aria-label={`Abrir ${arquivo.nome}`}>Abrir</button>
    </li>
  );
}

export function DocumentoDoPop({ pop, origem, pdf, abrirArquivo, arquivoInicial }: {
  pop: PopPublico;
  /** A página pública de onde as referências saem (para o "Voltar para…" do destino); nula dentro do app. */
  origem: { tipo: 'p'; link: string } | null;
  /** Endereço do PDF desta versão. */
  pdf: string;
  /** Pede ao servidor o endereço para abrir um arquivo desta versão (decisão 141). */
  abrirArquivo: (id: string) => Promise<Abertura>;
  /** Arquivo a abrir ao chegar (o link "Abrir" do PDF traz `?arquivo=`). */
  arquivoInicial?: string | null;
}) {
  const arquivos = pop.arquivos ?? [];
  const [vendo, setVendo] = useState<string | null>(arquivoInicial && arquivos.some((a) => a.id === arquivoInicial) ? arquivoInicial : null);
  const [ampliada, setAmpliada] = useState<number | null>(null); // índice em `prints`
  const c = pop.conteudo;
  const fluxo = pop.fluxograma;
  const Rico = ({ valor }: { valor: string }) => <RicoPublico valor={valor} refs={pop.referencias} de={origem} />;
  const envolvidos = c.envolvidos.filter((e) => e.area || e.cargo);
  const criado = new Date(pop.criado_em);

  // As etapas com pelo menos um passo escrito ou com print, com os passos numerados do início ao fim do POP, como no
  // PDF. Todos os prints, nessa ordem, vão para o visualizador, que passa de um para o outro.
  const prints: ImagemAmpliavel[] = [];
  const porId = new Map(arquivos.map((a) => [a.id, a]));
  const base = etapasDoDocumento(c.procedimentos, (caminho) => !!pop.imagens[caminho], (id) => porId.has(id));
  const gerais = arquivosGerais(arquivos, base); // os que não estão em nenhuma etapa: referência geral do POP
  const etapas = base.map((e) => ({
    ...e,
    passos: e.passos.map((s) => {
      const src = s.imagem ? pop.imagens[s.imagem] : undefined;
      let print: number | null = null;
      if (src) { print = prints.length; prints.push({ src, alt: `Tela do passo ${s.numero}`, legenda: `${e.nome || `Etapa ${e.ordem}`} · Passo ${s.numero}` }); }
      return { numero: s.numero, texto: s.texto, src, print, largura: s.passo.imagem_largura, altura: s.passo.imagem_altura };
    }),
  }));

  return (
    <article className="docpop">
      <header>
        <div className="docpop-masthead" role="img" aria-label={pop.onde.organizacao ?? 'Logo'}>
          <div className="docpop-padrao" />
          <div className="docpop-logo" />
        </div>
        <div className="docpop-topo">
          <p className="docpop-kicker"><b>POP</b> - Procedimento Operacional Padrão</p>
          <a className="btn btn-primary docpop-pdf" href={pdf}><Icone nome="baixar" tamanho={16} />Baixar PDF</a>
        </div>
        <h1>
          <svg viewBox="0 0 44 44" aria-hidden="true"><circle cx="22" cy="22" r="22" fill="#fff3e0" /><g transform="translate(9 9) scale(1.0833)" fill="none" stroke="#f57c00" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 21h18" /><rect x="5" y="3" width="10" height="18" rx="1.2" /><path d="M15 9h3a1 1 0 0 1 1 1v11" /><path d="M8.5 7h3M8.5 11h3M8.5 15h3" /></g></svg>
          {c.area || pop.onde.area || pop.nome}
        </h1>
        <div className="docpop-regua" />
      </header>

      <Secao id="procedimento" icone="procedimento" titulo="Procedimento">
        <dl className="docpop-ficha">
          <div className="docpop-ficha-titulo"><span className="docpop-nome">{pop.nome}</span><span>{MESES[criado.getMonth()]}/{criado.getFullYear()}</span><span>Versão: {pop.versao || '—'}</span></div>
          <div className="docpop-campo"><dt>Data de criação</dt><dd>{dataBr(pop.criado_em)}</dd></div>
          <div className="docpop-campo"><dt>Código do procedimento</dt><dd>{pop.codigo}</dd></div>
          <div className="docpop-campo"><dt>Identificação do POP</dt><dd>{pop.identificacao || '—'}</dd></div>
          <div className="docpop-executor">
            <span className="docpop-executor-icone"><svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true" fill="none" stroke="#f57c00" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8" /></svg></span>
            <div><dt>Executor do processo</dt><dd>{c.executor || '—'}</dd></div>
          </div>
        </dl>
      </Secao>

      {textoPuro(c.objetivo) && (
        <Secao id="objetivo" icone="objetivo" titulo="Objetivo do processo">
          <div className="docpop-objetivo"><Rico valor={c.objetivo} /></div>
        </Secao>
      )}

      {envolvidos.length > 0 && (
        <Secao id="envolvidos" icone="envolvidos" titulo="Envolvidos">
          <ul className="docpop-envolvidos">{envolvidos.map((e, i) => <li key={i}><span>{e.area || '—'}</span><span>{e.cargo || '—'}</span></li>)}</ul>
        </Secao>
      )}

      <Secao id="fluxograma" icone="recursos" titulo="Recursos do processo">
        <div className="docpop-recursos">
          <div className="docpop-recurso">
            <span className="docpop-recurso-nome">Fluxograma</span>
            <span className="docpop-recurso-texto">Diagrama do fluxo ponta a ponta</span>
            {fluxo?.tem_svg
              ? <a className="docpop-pilula" href={`/f/${fluxo.link_publico}`} target="_blank" rel="noopener">Abrir diagrama</a>
              : <span className="docpop-pilula sem" title="O fluxograma do processo não está publicado">—</span>}
          </div>
        </div>
        {fluxo?.tem_svg && (
          <a href={`/f/${fluxo.link_publico}`} target="_blank" rel="noopener" className="docpop-fluxo" title="Abrir o fluxograma em tela cheia"><img src={urlSvg(fluxo.link_publico)} alt={`Fluxograma: ${fluxo.nome}`} /></a>
        )}
        {gerais.length > 0 && (
          <ul className="docpop-arquivos" aria-label="Arquivos do POP">
            {gerais.map((a) => <ArquivoNaLeitura key={a.id} arquivo={a} aoAbrir={() => setVendo(a.id)} />)}
          </ul>
        )}
      </Secao>

      <Secao id="procedimentos" icone="procedimentos" titulo="Procedimentos">
        {etapas.length === 0 && <p className="docpop-vazio">Este POP ainda não tem passos.</p>}
        {etapas.map((e) => (
          <div key={e.ordem} className="docpop-etapa" id={`procedimento-${e.ordem}`}>
            <p className="docpop-etapa-faixa"><b>Etapa {e.ordem}</b>{e.nome && <span>{e.nome}</span>}</p>
            {e.arquivos.length > 0 && (
              <ul className="docpop-arquivos da-etapa" aria-label={`Arquivos da etapa ${e.ordem}`}>
                {e.arquivos.map((x) => <ArquivoNaLeitura key={x} arquivo={porId.get(x)!} aoAbrir={() => setVendo(x)} />)}
              </ul>
            )}
            {e.passos.length > 0 && (
            <ol className="docpop-passos" start={e.passos[0].numero}>
              {e.passos.map((s) => (
                <li key={s.numero} className="docpop-passo">
                  <span className="docpop-numero" aria-hidden="true">{s.numero}</span>
                  <div className="docpop-cartao">
                    {s.src && s.print !== null && (
                      <button type="button" className={`docpop-print${s.largura && s.altura && s.altura > s.largura ? ' retrato' : ''}`} onClick={() => setAmpliada(s.print)}
                        aria-label={`Ampliar a tela do passo ${s.numero}`} title="Clique para ampliar">
                        <img src={s.src} alt={`Tela do passo ${s.numero}`} loading="lazy" width={s.largura} height={s.altura} />
                      </button>
                    )}
                    {s.texto && <div className="docpop-passo-texto"><Rico valor={s.texto} /></div>}
                  </div>
                </li>
              ))}
            </ol>
            )}
          </div>
        ))}
      </Secao>

      {pop.referenciado_em.length > 0 && (
        <Secao id="referenciado-em" icone="referencias" titulo="Referenciado em">
          <ReferenciadoEm itens={pop.referenciado_em} href={(x) => (x.url_publica ? comOrigem(x.url_publica, origem) : null)} />
        </Secao>
      )}

      {pop.historico.length > 0 && (
        <Secao id="historico" icone="historico" titulo="Histórico de revisões">
          <div className="docpop-tabela-rolagem">
            <table className="docpop-tabela">
              <thead><tr><th>Data</th><th>Elaborado por</th><th>Revisão</th></tr></thead>
              <tbody>{pop.historico.map((h, i) => <tr key={i}><td>{h.data}</td><td>{h.elaborado_por || pop.autor}</td><td>{h.revisao}</td></tr>)}</tbody>
            </table>
          </div>
        </Secao>
      )}

      <footer className="docpop-rodape">
        <span>POP {pop.identificacao ? `${pop.identificacao} · ` : ''}Código {pop.codigo}</span>
        <span>{pop.onde.organizacao ?? ''}</span>
      </footer>
      {ampliada !== null && prints[ampliada] && <VisualizadorImagens imagens={prints} inicial={ampliada} aoFechar={() => setAmpliada(null)} />}
      {vendo && <VisualizadorDeArquivo arquivos={arquivos} inicial={vendo} abrir={abrirArquivo} aoFechar={() => setVendo(null)} />}
    </article>
  );
}
