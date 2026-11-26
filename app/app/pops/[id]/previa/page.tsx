'use client';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { AvisoDePrevia, PreviaIndisponivel } from '@/components/AvisoDePrevia';
import { DocumentoDoPop } from '@/components/publico/DocumentoDoPop';
import { VoltarAoTopo } from '@/components/VoltarAoTopo';
import { abrirArquivo } from '@/lib/anexos';
import { obterPreviaDoPop, urlPdf, type PreviaDoPop } from '@/lib/pops';

// Prévia do POP antes de publicar (decisão 149): o que está no editor agora, no formato da página pública, com o aviso
// de que não é documento oficial. Só abre para quem criou o POP: para os outros, o servidor responde 403.

export default function PreviaDoPopPage() {
  const { id } = useParams<{ id: string }>();
  const [doc, setDoc] = useState<PreviaDoPop | null | undefined>(undefined);
  const [status, setStatus] = useState(0);
  const voltar = `/app/pops/${id}`;

  useEffect(() => {
    obterPreviaDoPop(id)
      .then((d) => { setDoc(d); document.title = `Prévia · ${d.nome}`; })
      .catch((e) => { setStatus(e instanceof Error && 'status' in e ? Number(e.status) : 0); setDoc(null); });
  }, [id]);

  if (doc === undefined) return <div className="page fundo-pop"><p className="notice">Carregando a prévia…</p></div>;
  if (doc === null) return <div className="page fundo-pop"><PreviaIndisponivel documento="POP" status={status} voltar={voltar} /></div>;

  return (
    <div className="page fundo-pop pagina-versao pagina-previa">
      <AvisoDePrevia documento="POP" previa={doc.previa} voltar={voltar} />
      <div className="versao-documento">
        <DocumentoDoPop pop={doc} origem={null} pdf={urlPdf(id)} abrirArquivo={(arquivoId) => abrirArquivo(id, arquivoId)} />
      </div>
      <VoltarAoTopo />
    </div>
  );
}
