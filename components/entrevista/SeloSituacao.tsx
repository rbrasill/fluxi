import { Icone } from '@/components/Icone';
import { situacaoDaEntrevista } from '@/lib/entrevistas';
import type { StatusEntrevista } from '@/lib/entrevista/topicos';

// O selo da situação de uma entrevista, igual nas listas e na página da conversa. Enquanto a pessoa está na
// ligação com a Maia (decisão 69), o selo é "Em andamento", com o microfone e um ponto que pulsa.

const CLASSE: Record<string, string> = { convidada: 'selo-convidada', em_andamento: 'selo-andamento', processando: 'selo-processando', concluida: 'selo-concluida', erro: 'selo-erro' };

export function SeloSituacao({ entrevista }: { entrevista: { status: StatusEntrevista; falas: number; em_ligacao?: boolean; entrevistado?: string | null; convite_enviado_em?: string | null; complemento_pendencias?: number | null } }) {
  const aoVivo = entrevista.status === 'em_andamento' && !!entrevista.em_ligacao;
  if (aoVivo) {
    return (
      <span className="selo-status selo-ao-vivo" title={`${entrevista.entrevistado ?? 'A pessoa'} está conversando com a Maia agora`}>
        <Icone nome="microfone" tamanho={13} />{situacaoDaEntrevista(entrevista)}
      </span>
    );
  }
  return <span className={`selo-status ${CLASSE[entrevista.status] ?? ''}`}>{situacaoDaEntrevista(entrevista)}</span>;
}
