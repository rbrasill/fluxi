'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Icone } from '@/components/Icone';
import { DocumentoDoPop } from '@/components/publico/DocumentoDoPop';
import { VoltarAoTopo } from '@/components/VoltarAoTopo';
import { ROTULO_DO_TIPO } from '@/lib/pop/versao';
import { obterVersaoDoPop, urlPdfDaVersao, type VersaoPublicadaDoPop } from '@/lib/pops';
import { dataBr } from '@/lib/publico';

// Uma versão publicada do POP, como saiu naquele dia (decisão 138): só leitura, com os textos e os prints da época e
// o PDF daquela versão. Abre pela aba Versões do POP.

export default function VersaoDoPopPage() {
  const { id, versao } = useParams<{ id: string; versao: string }>();
  const [doc, setDoc] = useState<VersaoPublicadaDoPop | null | undefined>(undefined);
  const [erro, setErro] = useState('');
  const voltar = `/app/pops/${id}?aba=versoes`;

  useEffect(() => {
    obterVersaoDoPop(id, versao)
      .then((d) => { setDoc(d); document.title = `${d.nome} · versão ${d.versao}`; })
      .catch((e) => { setErro(e instanceof Error && 'status' in e && e.status === 404 ? 'Esta versão não existe neste POP.' : 'Não foi possível carregar a versão agora. Tente de novo em instantes.'); setDoc(null); });
  }, [id, versao]);

  if (doc === undefined) return <div className="page fundo-pop"><p className="notice">Carregando…</p></div>;
  if (doc === null) {
    return (
      <div className="page fundo-pop">
        <p className="notice erro" role="alert">{erro}</p>
        <p><Link href={voltar} className="btn"><Icone nome="voltar" tamanho={16} />Voltar para o POP</Link></p>
      </div>
    );
  }

  const v = doc.desta_versao;
  const atual = doc.versao === v.versao_atual;
  return (
    <div className="page fundo-pop pagina-versao">
      <nav className="trilha" aria-label="Caminho">
        <Link href={`/app/pops/${id}`}>{v.pop_nome}</Link><Icone nome="avancar" tamanho={14} />
        <Link href={voltar}>Versões</Link><Icone nome="avancar" tamanho={14} />
        <span aria-current="page">Versão {doc.versao}</span>
      </nav>
      <div className={`aviso versao-aviso${atual ? ' atual' : ''}`} role="status">
        <Icone nome="versoes" tamanho={18} />
        <span>
          <b>{atual ? `Versão ${doc.versao}, a atual.` : `Você está vendo a versão ${doc.versao}, que não é a atual (${v.versao_atual}).`}</b>{' '}
          Publicada em {dataBr(doc.publicado_em)}{v.publicado_por ? ` por ${v.publicado_por}` : ''}. {ROTULO_DO_TIPO[v.tipo]}: {v.o_que_mudou} Só para leitura.
        </span>
        <span className="aviso-acoes"><Link href={voltar} className="btn"><Icone nome="voltar" tamanho={16} />Voltar para o POP</Link></span>
      </div>
      <div className="versao-documento">
        <DocumentoDoPop pop={doc} origem={null} pdf={urlPdfDaVersao(id, doc.versao)} />
      </div>
      <VoltarAoTopo />
    </div>
  );
}
