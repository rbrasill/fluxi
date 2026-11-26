import { Icone } from '@/components/Icone';
import { ROTULO_SITUACAO, visualizacaoDe, type Arquivo, type Situacao, type Visualizacao } from '@/lib/anexos';

// Peças pequenas das telas de arquivos do POP (decisão 141).

export const SeloSituacao = ({ situacao }: { situacao: Situacao }) => <span className={`selo-status selo-arq-${situacao}`}>{ROTULO_SITUACAO[situacao]}</span>;

const ICONE: Record<Visualizacao, string> = { pdf: 'documento', imagem: 'imagem', video: 'video', audio: 'audio', outro: 'clipe' };
/** O quadradinho com o ícone do formato (PDF, imagem, vídeo, áudio ou outro). */
export function IconeDoArquivo({ arquivo, tamanho = 18 }: { arquivo: Pick<Arquivo, 'tipo' | 'nome'>; tamanho?: number }) {
  const v = visualizacaoDe(arquivo);
  return <span className={`arq-icone arq-icone-${v}`} aria-hidden="true"><Icone nome={ICONE[v]} tamanho={tamanho} /></span>;
}
