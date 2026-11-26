import { Icone } from '@/components/Icone';

// O aviso das páginas de prévia (decisão 149): fica preso no topo enquanto a pessoa rola, para ninguém tomar a prévia
// (numa captura de tela, por exemplo) por documento oficial.

export type SituacaoDaPrevia = { pendente: boolean; versao_publicada: string | null };

export function AvisoDePrevia({ documento, previa, voltar }: { documento: 'POP' | 'processo'; previa: SituacaoDaPrevia; voltar: string }) {
  const so = <span className="aviso-previa-linha">Esta página é visível exclusivamente para você, responsável pela criação {documento === 'POP' ? 'deste POP' : 'deste processo'}.</span>;
  return (
    <div className={`aviso aviso-previa${previa.pendente ? '' : ' igual'}`} role="status">
      <Icone nome="olho" tamanho={20} />
      <span className="aviso-previa-texto">
        {!previa.pendente ? (
          <><b className="aviso-previa-linha">Sem alterações a publicar</b><span className="aviso-previa-linha">Esta prévia está igual à versão oficial, a <b>{previa.versao_publicada}</b>.</span>{so}</>
        ) : previa.versao_publicada ? (
          <><b className="aviso-previa-linha">Prévia de alterações não publicadas</b><span className="aviso-previa-linha">O conteúdo exibido abaixo é apenas uma prévia e não possui validade oficial. Até que uma nova versão seja publicada, a versão oficial permanece sendo a <b>{previa.versao_publicada}</b>.</span>{so}</>
        ) : (
          <><b className="aviso-previa-linha">Prévia {documento === 'POP' ? 'de POP' : 'de processo'} ainda não publicado</b><span className="aviso-previa-linha">O conteúdo exibido abaixo é apenas uma prévia e não possui validade oficial. Ainda não há versão oficial: ela passa a existir quando {documento === 'POP' ? 'o POP' : 'o processo'} for publicado.</span>{so}</>
        )}
      </span>
      <span className="aviso-acoes"><a href={voltar} className="btn"><Icone nome="voltar" tamanho={16} />Voltar para o {documento}</a></span>
    </div>
  );
}

/** Quando a prévia não abre: quem não criou (403), documento que não existe (404) ou falha. */
export function PreviaIndisponivel({ documento, status, voltar }: { documento: 'POP' | 'processo'; status: number; voltar: string }) {
  const restrita = status === 403;
  return (
    <div className="previa-indisponivel">
      <p className={`notice${restrita ? '' : ' erro'}`} role="alert">
        {restrita
          ? <><b>Esta prévia só abre para quem criou o {documento}.</b> Ela mostra um conteúdo que ainda não foi publicado e não vale como documento oficial. Para ver a versão oficial, use a página pública do {documento}.</>
          : status === 404 ? `Este ${documento} não existe.` : 'Não foi possível carregar a prévia agora. Tente de novo em instantes.'}
      </p>
      <p><a href={voltar} className="btn"><Icone nome="voltar" tamanho={16} />Voltar para o {documento}</a></p>
    </div>
  );
}
