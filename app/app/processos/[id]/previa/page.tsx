'use client';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { AvisoDePrevia, PreviaIndisponivel } from '@/components/AvisoDePrevia';
import { Icone } from '@/components/Icone';
import { RicoPublico } from '@/components/publico/Referencias';
import { ICONE_DOC } from '@/components/SeloDocumento';
import { VoltarAoTopo } from '@/components/VoltarAoTopo';
import { textoPuro } from '@/lib/pop/texto-rico';
import { obterPreviaDoProcesso, type PreviaDoProcesso } from '@/lib/processos';
import { dataBr } from '@/lib/publico';

// Prévia do processo antes de publicar (decisão 149): o nome, a descrição e o fluxograma como estão agora, no formato
// da página pública, com o aviso de que não é documento oficial. Os POPs listados são os que já estão no ar (cada POP
// tem a sua prévia). Abre para todos os perfis (decisão 150).

export default function PreviaDoProcessoPage() {
  const { id } = useParams<{ id: string }>();
  const [p, setP] = useState<PreviaDoProcesso | null | undefined>(undefined);
  const [status, setStatus] = useState(0);
  const voltar = `/app/processos/${id}`;

  useEffect(() => {
    obterPreviaDoProcesso(id)
      .then((d) => { setP(d); document.title = `Prévia · ${d.nome}`; })
      .catch((e) => { setStatus(e instanceof Error && 'status' in e ? Number(e.status) : 0); setP(null); });
  }, [id]);

  if (p === undefined) return <div className="page fundo-processo"><p className="notice">Carregando a prévia…</p></div>;
  if (p === null) return <div className="page fundo-processo"><PreviaIndisponivel documento="processo" status={status} voltar={voltar} /></div>;

  const dados: [string, string][] = ([
    ['Código', p.codigo],
    ['Área', p.onde.area],
    ['Organização', p.onde.organizacao],
  ] as [string, string | null][]).filter((x): x is [string, string] => !!x[1]);
  const svg = p.fluxograma ? `/api/fluxogramas/${p.fluxograma.id}/svg` : '';
  return (
    <div className="page fundo-processo pagina-versao pagina-previa">
      <AvisoDePrevia documento="processo" previa={p.previa} voltar={voltar} />
      <div className="pub-corpo versao-corpo">
        <header className="pub-titulo">
          <span className="pub-tipo"><img src={ICONE_DOC.processo} alt="" width={20} height={20} />Processo</span>
          <h1>{p.nome}</h1>
          <dl className="pub-dados">
            {dados.map(([k, valor]) => <div key={k}><dt>{k}</dt><dd>{valor}</dd></div>)}
          </dl>
        </header>
        {textoPuro(p.descricao) && (
          <section className="pub-secao" id="descricao">
            <h2>Descrição do processo</h2>
            <RicoPublico valor={p.descricao} refs={p.referencias} de={null} />
          </section>
        )}
        {p.fluxograma && (
          <section className="pub-secao" id="fluxograma">
            <h2>Fluxograma do processo</h2>
            {p.fluxograma.tem_svg
              ? <a href={svg} target="_blank" rel="noopener" className="pub-fluxo-mini" title="Abrir o fluxograma em tela cheia"><img src={svg} alt={`Fluxograma: ${p.fluxograma.nome}`} /></a>
              : <p className="notice">O fluxograma ainda não tem a imagem para a página pública. Abra o fluxograma uma vez (a imagem é gerada ao abrir) antes de publicar.</p>}
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
                    <a className="pub-pop" href={`/p/${o.link_publico}`} target="_blank" rel="noopener">
                      <span className="pop-icone"><Icone nome="pop" tamanho={20} /></span>
                      <span className="pub-pop-texto">
                        <strong>{o.identificacao ? `${o.identificacao} · ` : ''}{o.nome}</strong>
                        <span>{[o.versao && `Versão ${o.versao}`, o.publicado_em && `publicado em ${dataBr(o.publicado_em)}`].filter(Boolean).join(' · ')}</span>
                      </span>
                      <Icone nome="avancar" tamanho={18} />
                    </a>
                  </li>
                ))}
              </ol>
            )}
        </section>
      </div>
      <VoltarAoTopo />
    </div>
  );
}
