import { Icone } from '@/components/Icone';

// O aviso das páginas de prévia (decisão 149): fica preso no topo enquanto a pessoa rola, para ninguém tomar a prévia
// (numa captura de tela, por exemplo) por documento oficial.

export type SituacaoDaPrevia = { pendente: boolean; versao_publicada: string | null };

export function AvisoDePrevia({ documento, previa, voltar }: { documento: 'POP' | 'processo'; previa: SituacaoDaPrevia; voltar: string }) {
  const so = `Só você, que criou o ${documento}, vê esta página.`;
  return (
    <div className={`aviso aviso-previa${previa.pendente ? '' : ' igual'}`} role="status">
      <Icone nome="olho" tamanho={20} />
      <span>
        {!previa.pendente ? (
          <><b>Sem alterações a publicar.</b> Esta prévia está igual à versão {previa.versao_publicada}, que é a publicada. {so}</>
        ) : previa.versao_publicada ? (
          <><b>Prévia das alterações ainda não publicadas.</b> O conteúdo abaixo não tem validade oficial: a versão oficial é a {previa.versao_publicada}, até você publicar de novo. {so}</>
        ) : (
          <><b>Prévia: este {documento} ainda não foi publicado.</b> O conteúdo abaixo não tem validade oficial e pode mudar até a publicação. {so}</>
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
