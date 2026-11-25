import Link from 'next/link';
import { Icone } from '@/components/Icone';
import { ROTULO_DO_TIPO, type VersaoDoPop } from '@/lib/pop/versao';

// Aba Versões do POP (decisão 138): uma linha por versão publicada, da mais nova para a mais antiga. É preenchida
// sozinha a cada publicação; de cada versão dá para abrir o documento como saiu e baixar o PDF.

const data = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });

export function VersoesDoPop({ popId, versoes }: { popId: string; versoes: VersaoDoPop[] }) {
  return (
    <section className="cartao pop-sec" id="pos-versoes" aria-labelledby="titulo-versoes">
      <div className="sec-cabeca">
        <h2 id="titulo-versoes" className="titulo-com-conta">Versões{versoes.length > 0 && <small>{versoes.length}</small>}</h2>
        <p>Uma linha por versão publicada. É preenchida sozinha a cada publicação e vai para o PDF e para a página pública.</p>
      </div>
      {versoes.length === 0
        ? <p className="recursos-vazio">Este POP ainda não foi publicado. A primeira publicação vira a versão 1.0.0.</p>
        : (
          <div className="rev-lista" role="table" aria-label="Versões publicadas">
            <div className="rev-cab" role="row"><span role="columnheader">Versão</span><span role="columnheader">Data</span><span role="columnheader">Publicado por</span><span role="columnheader">O que mudou</span><span /></div>
            {versoes.map((v, i) => (
              <div key={v.versao} className={`rev-linha${i === 0 ? ' atual' : ''}`} role="row">
                <span className="rev-versao" role="cell"><b className="mono">{v.versao}</b>{i === 0 && <span className="rev-atual">Atual</span>}</span>
                <span className="rev-data" role="cell">{data(v.publicado_em)}</span>
                <span className="rev-quem" role="cell">{v.publicado_por || '—'}</span>
                <span className="rev-oque" role="cell"><span className={`rev-tipo rev-${v.tipo}`}>{ROTULO_DO_TIPO[v.tipo]}</span>{' '}{v.o_que_mudou}</span>
                <span className="rev-acoes" role="cell">
                  <Link href={`/app/pops/${popId}/versoes/${v.versao}`} className="btn btn-ghost" title="Abre o POP como foi publicado nesta versão, só para leitura">Ver</Link>
                  <a href={`/api/pops/${popId}/versoes/${v.versao}/pdf`} className="btn btn-ghost btn-icon" title={`Baixar o PDF da versão ${v.versao}`} aria-label={`Baixar o PDF da versão ${v.versao}`}><Icone nome="baixar" tamanho={16} /></a>
                </span>
              </div>
            ))}
          </div>
        )}
    </section>
  );
}
