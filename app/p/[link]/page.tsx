'use client';
import { useParams, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { VoltarAoTopo } from '@/components/VoltarAoTopo';
import { CabecalhoPublico, Indisponivel } from '@/components/publico/CabecalhoPublico';
import { DocumentoDoPop } from '@/components/publico/DocumentoDoPop';
import { VoltarPara } from '@/components/publico/Referencias';
import { comOrigem } from '@/lib/referencias';
import { dataBr, obterPopPublico, urlDocumentoPublico, type PopPublico } from '@/lib/publico';

// Página pública do POP (decisão 32): a versão publicada, só leitura, com o fluxograma do processo.

function PopPublicoPage() {
  const { link } = useParams<{ link: string }>();
  const de = useSearchParams().get('de'); // chegou por uma referência: de onde (decisão 35)
  const origem = { tipo: 'p' as const, link };
  const [pop, setPop] = useState<PopPublico | null | undefined>(undefined);
  const [erro, setErro] = useState('');

  useEffect(() => {
    obterPopPublico(link)
      .then((p) => { setPop(p); document.title = `${p.nome} · POP`; })
      .catch((e) => { setErro(e instanceof Error && 'status' in e && e.status !== 404 ? 'Não foi possível carregar o POP agora. Tente de novo em instantes.' : ''); setPop(null); });
  }, [link]);

  if (pop === undefined) return <div className="pub"><CabecalhoPublico /><main className="pub-corpo"><p className="notice">Carregando…</p></main></div>;
  if (pop === null) {
    return <Indisponivel titulo={erro ? 'Erro ao carregar' : 'Este POP não está disponível'} mensagem={erro || 'O POP pode ter saído do ar ou o link foi digitado errado. Peça o link atualizado a quem o enviou.'} voltar={de} />;
  }

  return (
    <div className="pub">
      <CabecalhoPublico onde={pop.onde} processoHref={pop.processo_link ? comOrigem(`/pr/${pop.processo_link}`, origem) : null} />
      <main className="pub-corpo">
        <VoltarPara de={de} />
        <DocumentoDoPop pop={pop} origem={origem} pdf={urlDocumentoPublico(link, 'pdf')} />
        <footer className="pub-rodape">Versão publicada em {dataBr(pop.publicado_em)} · Publicado com INCFlow</footer>
      </main>
      <VoltarAoTopo />
    </div>
  );
}

export default function Page() {
  return <Suspense><PopPublicoPage /></Suspense>;
}
