'use client';
import { Icone } from '@/components/Icone';

// Faixa "Página pública" do editor do POP (decisão 34): uma chave liga (online) ou desliga
// (offline) o link público, sem mexer na versão publicada. Ao lado, copiar e abrir o link.

export type EstadoPaginaPublica = 'rascunho' | 'online' | 'offline' | 'arquivado';

const dataBr = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('pt-BR') : '');

export function PaginaPublica({ tipo = 'pop', variante = 'faixa', estado, publicadoEm = null, alteracoesNaoPublicadas = false, url, alterando, copiado, aoAlternar, aoCopiar }: {
  tipo?: 'pop' | 'processo';
  variante?: 'faixa' | 'cartao'; // 'cartao': o cartão da coluna lateral da página do processo (redesign, decisão 77)
  estado: EstadoPaginaPublica;
  publicadoEm?: string | null;
  alteracoesNaoPublicadas?: boolean;
  url: string;
  alterando: boolean;
  copiado: boolean;
  aoAlternar: () => void;
  aoCopiar: () => void;
}) {
  const online = estado === 'online';
  const comLink = estado === 'online' || estado === 'offline';
  const explicacao = tipo === 'processo' ? {
    rascunho: '',
    online: 'Qualquer pessoa com o link vê o processo: a descrição, o fluxograma e os POPs publicados. O que você muda aqui aparece na hora.',
    offline: 'Quem abrir o link vê “Este processo não está disponível”. Ligue a chave para colocar no ar.',
    arquivado: 'Processo arquivado: a página pública fica fora do ar.',
  }[estado] : {
    rascunho: 'Publique o POP para poder colocar a página pública no ar.',
    online: `Qualquer pessoa com o link vê a versão publicada em ${dataBr(publicadoEm)}.${alteracoesNaoPublicadas ? ' As últimas alterações ainda não estão nela.' : ''}`,
    offline: 'Quem abrir o link vê “Este POP não está disponível”. A versão publicada continua guardada: ligue a chave para voltar ao ar.',
    arquivado: 'POP arquivado: a página pública fica fora do ar.',
  }[estado];

  const rotulo = tipo === 'processo' ? 'Página pública do processo' : 'Página pública do POP';
  if (variante === 'cartao') {
    return (
      <section className={`cartao cartao-lateral publica-cartao ${estado}`} aria-label={rotulo}>
        <div className="lateral-topo">
          <span className="lateral-icone"><Icone nome="globo" tamanho={20} /></span>
          <div className="lateral-titulo" aria-live="polite">
            <h3>Página pública</h3>
            <span className={`estado-publica${online ? ' online' : ''}`}>{online ? 'Online' : 'Offline'}</span>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={online}
            aria-label="Página pública online"
            className={`interruptor${online ? ' ligado' : ''}`}
            onClick={aoAlternar}
            disabled={!comLink || alterando}
            title={!comLink ? explicacao : online ? 'Desligar: a página pública sai do ar' : 'Ligar: a página pública volta ao ar'}
          >
            <span aria-hidden="true" />
          </button>
        </div>
        <p className="lateral-texto">{explicacao}</p>
        {comLink && (
          <div className="publica-acoes">
            <button type="button" className="btn" onClick={aoCopiar} title="Copia o endereço da página pública">
              <Icone nome={copiado ? 'check' : 'link'} tamanho={16} />{copiado ? 'Link copiado' : 'Copiar link'}
            </button>
            <a className="btn btn-icon" href={url} target="_blank" rel="noopener" aria-label="Abrir a página pública" title="Abrir a página pública numa nova aba">
              <Icone nome="externo" tamanho={16} />
            </a>
          </div>
        )}
      </section>
    );
  }

  return (
    <section className={`pagina-publica ${estado}`} aria-label={tipo === 'processo' ? 'Página pública do processo' : 'Página pública do POP'}>
      <button
        type="button"
        role="switch"
        aria-checked={online}
        aria-label="Página pública online"
        className={`chave${online ? ' ligada' : ''}`}
        onClick={aoAlternar}
        disabled={!comLink || alterando}
        title={!comLink ? explicacao : online ? 'Desligar: a página pública sai do ar' : 'Ligar: a página pública volta ao ar'}
      >
        <span className="chave-texto" aria-hidden="true">{online ? 'ON' : 'OFF'}</span>
        <span className="chave-bola" aria-hidden="true" />
      </button>
      <div className="pagina-publica-texto" aria-live="polite">
        <strong>Página pública {online ? 'online' : 'offline'}</strong>
        <span>{explicacao}</span>
      </div>
      {comLink && (
        <div className="pagina-publica-acoes">
          <button type="button" className="btn btn-ghost" onClick={aoCopiar} title="Copia o endereço da página pública do POP">
            <Icone nome={copiado ? 'check' : 'link'} tamanho={16} />{copiado ? 'Link copiado' : 'Copiar link'}
          </button>
          <a className="btn btn-ghost btn-icon" href={url} target="_blank" rel="noopener" aria-label="Abrir a página pública" title="Abrir a página pública numa nova aba">
            <Icone nome="externo" tamanho={16} />
          </a>
        </div>
      )}
    </section>
  );
}
