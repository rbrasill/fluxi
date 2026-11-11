'use client';
import { Icone } from '@/components/Icone';

// Faixa no topo de um processo, POP ou entrevista arquivada (decisões 31 e 72): diz desde quando (e, na entrevista,
// por quem), e oferece restaurar e, só aqui, excluir definitivamente. Quem chama confirma a exclusão num diálogo
// antes. Sem `aoExcluir` (o gestor, na entrevista), só restaura.

const TEXTO = {
  processo: ['Processo arquivado', 'Não aparece nas listas e não pode ser editado.'],
  POP: ['POP arquivado', 'Não aparece nas listas e não pode ser editado.'],
  entrevista: ['Entrevista arquivada', 'Não aparece no processo, não entra no fluxograma e não pode ser continuada.'],
} as const;

export function FaixaArquivado({ tipo, desde, por, aoRestaurar, aoExcluir, ocupado }: {
  tipo: keyof typeof TEXTO;
  desde: string;
  por?: string | null;
  aoRestaurar: () => void;
  aoExcluir?: () => void;
  ocupado?: boolean;
}) {
  return (
    <div className="aviso arquivado" role="status">
      <Icone nome="arquivar" tamanho={18} />
      <span>
        <b>{TEXTO[tipo][0]}</b> em {new Date(desde).toLocaleDateString('pt-BR')}{por ? ` por ${por}` : ''}.
        {' '}{TEXTO[tipo][1]} {aoExcluir ? 'Restaure para voltar a usar, ou exclua definitivamente.' : 'Restaure para voltar a usar. Só administradores excluem definitivamente.'}
      </span>
      <span className="aviso-acoes">
        {aoExcluir && <button type="button" className="btn btn-perigo" onClick={aoExcluir} disabled={ocupado}><Icone nome="lixo" tamanho={16} />Excluir definitivamente</button>}
        <button type="button" className="btn btn-primary" onClick={aoRestaurar} disabled={ocupado}><Icone nome="desfazer" tamanho={16} />Restaurar</button>
      </span>
    </div>
  );
}
