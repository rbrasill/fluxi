'use client';
import { Icone } from '@/components/Icone';

// Faixa no topo de um processo ou POP arquivado (decisão 31): diz desde quando, e oferece restaurar
// e, só aqui, excluir definitivamente. Quem chama confirma a exclusão num diálogo antes.

export function FaixaArquivado({ tipo, desde, aoRestaurar, aoExcluir, ocupado }: {
  tipo: 'processo' | 'POP';
  desde: string;
  aoRestaurar: () => void;
  aoExcluir: () => void;
  ocupado?: boolean;
}) {
  return (
    <div className="aviso arquivado" role="status">
      <Icone nome="arquivar" tamanho={18} />
      <span>
        <b>{tipo === 'POP' ? 'POP arquivado' : 'Processo arquivado'}</b> em {new Date(desde).toLocaleDateString('pt-BR')}.
        {' '}Não aparece nas listas e não pode ser editado. Restaure para voltar a usar, ou exclua definitivamente.
      </span>
      <span className="aviso-acoes">
        <button type="button" className="btn btn-perigo" onClick={aoExcluir} disabled={ocupado}><Icone nome="lixo" tamanho={16} />Excluir definitivamente</button>
        <button type="button" className="btn btn-primary" onClick={aoRestaurar} disabled={ocupado}><Icone nome="desfazer" tamanho={16} />Restaurar</button>
      </span>
    </div>
  );
}
