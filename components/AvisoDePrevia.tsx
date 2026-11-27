import { Icone } from '@/components/Icone';
import { dataBr } from '@/lib/publico';

// O aviso das páginas de prévia (decisões 149 e 150): fica preso no topo enquanto a pessoa rola, para ninguém tomar a
// prévia (numa captura de tela, por exemplo) por documento oficial. Diz se o documento tem alterações que ainda não
// foram publicadas e qual é a versão oficial.

export type SituacaoDaPrevia = { pendente: boolean; versao_publicada: string | null; alterado_em: string };

export function AvisoDePrevia({ documento, previa, voltar }: { documento: 'POP' | 'processo'; previa: SituacaoDaPrevia; voltar: string }) {
  const este = documento === 'POP' ? 'Este POP' : 'Este processo';
  const desde = previa.alterado_em ? ` Última alteração em ${dataBr(previa.alterado_em)}.` : '';
  return (
    <div className={`aviso aviso-previa${previa.pendente ? '' : ' igual'}`} role="status">
      <Icone nome="olho" tamanho={20} />
      <span className="aviso-previa-texto">
        {!previa.pendente ? (
          <>
            <b className="aviso-previa-linha">Prévia sem alterações</b>
            <span className="aviso-previa-linha">{este} não tem alterações a publicar: o conteúdo abaixo é igual ao da versão oficial, a <b>{previa.versao_publicada}</b>.</span>
          </>
        ) : previa.versao_publicada ? (
          <>
            <b className="aviso-previa-linha">Prévia de alterações não publicadas</b>
            <span className="aviso-previa-linha">{este} foi alterado depois da versão <b>{previa.versao_publicada}</b> e as alterações ainda não foram publicadas.{desde}</span>
            <span className="aviso-previa-linha">O conteúdo exibido abaixo é apenas uma prévia e não possui validade oficial. Até que uma nova versão seja publicada, a versão oficial permanece sendo a <b>{previa.versao_publicada}</b>.</span>
          </>
        ) : (
          <>
            <b className="aviso-previa-linha">Prévia {documento === 'POP' ? 'de POP' : 'de processo'} ainda não publicado</b>
            <span className="aviso-previa-linha">O conteúdo exibido abaixo é apenas uma prévia e não possui validade oficial. Ainda não há versão oficial: ela passa a existir quando {documento === 'POP' ? 'o POP' : 'o processo'} for publicado.{desde}</span>
          </>
        )}
      </span>
      <span className="aviso-acoes"><a href={voltar} className="btn"><Icone nome="voltar" tamanho={16} />Voltar para o {documento}</a></span>
    </div>
  );
}

/** Quando a prévia não abre: documento que não existe (404) ou falha. */
export function PreviaIndisponivel({ documento, status, voltar }: { documento: 'POP' | 'processo'; status: number; voltar: string }) {
  return (
    <div className="previa-indisponivel">
      <p className="notice erro" role="alert">
        {status === 404 ? `Este ${documento} não existe.` : 'Não foi possível carregar a prévia agora. Tente de novo em instantes.'}
      </p>
      <p><a href={voltar} className="btn"><Icone nome="voltar" tamanho={16} />Voltar para o {documento}</a></p>
    </div>
  );
}
