'use client';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Icone } from '@/components/Icone';
import { RicoPublico } from '@/components/publico/Referencias';
import { ICONE_DOC } from '@/components/SeloDocumento';
import { VoltarAoTopo } from '@/components/VoltarAoTopo';
import { textoPuro } from '@/lib/pop/texto-rico';
import { obterVersaoDoProcesso, urlSvgDaVersaoDoProcesso, type VersaoPublicadaDoProcesso } from '@/lib/processos';
import { dataBr } from '@/lib/publico';
import { ROTULOS_POR_DOCUMENTO } from '@/lib/versao';

// Uma versão publicada do processo, como saiu naquele dia (decisão 139): só leitura, com a descrição e o fluxograma
// da época. Abre pela aba Versões do processo. Os POPs não aparecem: cada um tem as suas versões.

export default function VersaoDoProcessoPage() {
  const { id, versao } = useParams<{ id: string; versao: string }>();
  const [doc, setDoc] = useState<VersaoPublicadaDoProcesso | null | undefined>(undefined);
  const [erro, setErro] = useState('');
  // Link comum (recarrega a página): o processo abre a aba pelo "#" do endereço.
  const voltar = `/app/processos/${id}#versoes`;

  useEffect(() => {
    obterVersaoDoProcesso(id, versao)
      .then((d) => { setDoc(d); document.title = `${d.nome} · versão ${d.versao}`; })
      .catch((e) => { setErro(e instanceof Error && 'status' in e && e.status === 404 ? 'Esta versão não existe neste processo.' : 'Não foi possível carregar a versão agora. Tente de novo em instantes.'); setDoc(null); });
  }, [id, versao]);

  if (doc === undefined) return <div className="page fundo-processo"><p className="notice">Carregando…</p></div>;
  if (doc === null) {
    return (
      <div className="page fundo-processo">
        <p className="notice erro" role="alert">{erro}</p>
        <p><a href={voltar} className="btn"><Icone nome="voltar" tamanho={16} />Voltar para o processo</a></p>
      </div>
    );
  }

  const v = doc.desta_versao;
  const atual = doc.versao === v.versao_atual;
  const dados: [string, string][] = ([
    ['Código', doc.codigo],
    ['Versão', doc.versao],
    ['Área', doc.onde.area],
    ['Organização', doc.onde.organizacao],
    ['Publicado em', dataBr(doc.publicado_em)],
  ] as [string, string | null][]).filter((x): x is [string, string] => !!x[1]);
  return (
    <div className="page fundo-processo pagina-versao">
      <nav className="trilha" aria-label="Caminho">
        <a href={`/app/processos/${id}`}>{v.processo_nome}</a><Icone nome="avancar" tamanho={14} />
        <a href={voltar}>Versões</a><Icone nome="avancar" tamanho={14} />
        <span aria-current="page">Versão {doc.versao}</span>
      </nav>
      <div className={`aviso versao-aviso${atual ? ' atual' : ''}`} role="status">
        <Icone nome="versoes" tamanho={18} />
        <span>
          <b>{atual ? `Versão ${doc.versao}, a atual.` : `Você está vendo a versão ${doc.versao}, que não é a atual (${v.versao_atual}).`}</b>{' '}
          Publicada em {dataBr(doc.publicado_em)}{v.publicado_por ? ` por ${v.publicado_por}` : ''}. {ROTULOS_POR_DOCUMENTO.processo[v.tipo]}: {v.o_que_mudou} Só para leitura.
        </span>
        <span className="aviso-acoes"><a href={voltar} className="btn"><Icone nome="voltar" tamanho={16} />Voltar para o processo</a></span>
      </div>
      <div className="pub-corpo versao-corpo">
        <header className="pub-titulo">
          <span className="pub-tipo"><img src={ICONE_DOC.processo} alt="" width={20} height={20} />Processo</span>
          <h1>{doc.nome}</h1>
          <dl className="pub-dados">
            {dados.map(([k, valor]) => <div key={k}><dt>{k}</dt><dd>{valor}</dd></div>)}
          </dl>
        </header>
        {textoPuro(doc.descricao) && (
          <section className="pub-secao" id="descricao">
            <h2>Descrição do processo</h2>
            <RicoPublico valor={doc.descricao} refs={doc.referencias} de={null} />
          </section>
        )}
        {doc.fluxograma ? (
          <section className="pub-secao" id="fluxograma">
            <h2>Fluxograma do processo</h2>
            {doc.fluxograma.tem_svg
              ? <a href={urlSvgDaVersaoDoProcesso(id, doc.versao)} target="_blank" rel="noopener" className="pub-fluxo-mini" title="Abrir o fluxograma desta versão em tela cheia"><img src={urlSvgDaVersaoDoProcesso(id, doc.versao)} alt={`Fluxograma: ${doc.fluxograma.nome}`} /></a>
              : <p className="notice">Esta versão foi publicada sem a imagem do fluxograma.</p>}
          </section>
        ) : <p className="notice">Esta versão foi publicada sem fluxograma.</p>}
      </div>
      <VoltarAoTopo />
    </div>
  );
}
