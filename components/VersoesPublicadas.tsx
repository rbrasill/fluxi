import Link from 'next/link';
import { Icone } from '@/components/Icone';
import { ROTULOS_POR_DOCUMENTO, type DocumentoVersionado, type VersaoPublicada } from '@/lib/versao';

// Aba Versões do POP e do processo (decisões 138 e 139): uma linha por versão publicada, da mais nova para a mais
// antiga. É preenchida sozinha a cada publicação; de cada versão dá para abrir o documento como saiu e, no POP,
// baixar o PDF.

const data = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
const TEXTOS: Record<DocumentoVersionado, { explica: string; vazio: string; ver: string }> = {
  pop: { explica: 'Uma linha por versão publicada. É preenchida sozinha a cada publicação e vai para o PDF e para a página pública.', vazio: 'Este POP ainda não foi publicado. A primeira publicação vira a versão 1.0.0.', ver: 'Abre o POP como foi publicado nesta versão, só para leitura' },
  processo: { explica: 'Uma linha por versão publicada do processo (a descrição e o fluxograma). É preenchida sozinha a cada publicação. Os POPs têm as versões deles.', vazio: 'Este processo ainda não foi publicado. A primeira publicação vira a versão 1.0.0.', ver: 'Abre o processo como foi publicado nesta versão, só para leitura' },
};

export function VersoesPublicadas({ documento, versoes, ver, pdf }: {
  documento: DocumentoVersionado;
  versoes: VersaoPublicada[];
  /** Endereço da leitura de uma versão. */
  ver: (versao: string) => string;
  /** Endereço do PDF de uma versão (só o POP tem). */
  pdf?: (versao: string) => string;
}) {
  const txt = TEXTOS[documento];
  const rotulos = ROTULOS_POR_DOCUMENTO[documento];
  return (
    <section className="cartao pop-sec" id="pos-versoes" aria-labelledby="titulo-versoes">
      <div className="sec-cabeca">
        <h2 id="titulo-versoes" className="titulo-com-conta">Versões{versoes.length > 0 && <small>{versoes.length}</small>}</h2>
        <p>{txt.explica}</p>
      </div>
      {versoes.length === 0
        ? <p className="recursos-vazio">{txt.vazio}</p>
        : (
          <div className="rev-lista" role="table" aria-label="Versões publicadas">
            <div className="rev-cab" role="row"><span role="columnheader">Versão</span><span role="columnheader">Data</span><span role="columnheader">Publicado por</span><span role="columnheader">O que mudou</span><span /></div>
            {versoes.map((v, i) => (
              <div key={v.versao} className={`rev-linha${i === 0 ? ' atual' : ''}`} role="row">
                <span className="rev-versao" role="cell"><b className="mono">{v.versao}</b>{i === 0 && <span className="rev-atual">Atual</span>}</span>
                <span className="rev-data" role="cell">{data(v.publicado_em)}</span>
                <span className="rev-quem" role="cell">{v.publicado_por || '—'}</span>
                <span className="rev-oque" role="cell"><span className={`rev-tipo rev-${v.tipo}`}>{rotulos[v.tipo]}</span>{' '}{v.o_que_mudou}</span>
                <span className="rev-acoes" role="cell">
                  <Link href={ver(v.versao)} className="btn btn-ghost" title={txt.ver}>Ver</Link>
                  {pdf && <a href={pdf(v.versao)} className="btn btn-ghost btn-icon" title={`Baixar o PDF da versão ${v.versao}`} aria-label={`Baixar o PDF da versão ${v.versao}`}><Icone nome="baixar" tamanho={16} /></a>}
                </span>
              </div>
            ))}
          </div>
        )}
    </section>
  );
}
