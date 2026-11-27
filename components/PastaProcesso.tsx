'use client';
import Link from 'next/link';
import { Icone } from '@/components/Icone';
import { QuadroDoProcesso } from '@/components/IconeDoProcesso';
import type { IconeDoProcesso } from '@/lib/icones';

// Um processo como pasta (decisão 61), na página da área e em "Todos os processos": o ícone escolhido para o processo
// (decisão 133) ou, sem ícone, o quadradinho colorido, o nome, a data da última atualização e se a página pública do
// processo está no ar. A pasta inteira abre o processo; a
// arquivada mostra quando foi arquivada e o botão de restaurar.

const data = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });

export type ProcessoDaPasta = { id: string; nome: string; atualizado_em: string; arquivado_em: string | null; link_publico_ativo?: boolean; icone?: IconeDoProcesso | null };

export function PastaProcesso({ processo, aoRestaurar }: { processo: ProcessoDaPasta; aoRestaurar?: () => void }) {
  const arquivado = !!processo.arquivado_em;
  const online = !!processo.link_publico_ativo;
  return (
    <article className={`pasta-processo${arquivado ? ' arquivada' : ''}`} title={processo.nome}>
      <span className="pasta-aba" aria-hidden="true" />
      <div className="pasta-corpo">
        <div className="pasta-topo">
          <QuadroDoProcesso id={processo.id} icone={processo.icone} />
          <Link href={`/app/processos/${processo.id}`} className="pasta-nome">{processo.nome}</Link>
        </div>
        <div className="pasta-rodape">
          {arquivado ? (
            <>
              <span className="pasta-data">Arquivado em {data(processo.arquivado_em!)}</span>
              {aoRestaurar && <button type="button" className="btn btn-ghost pasta-restaurar" onClick={aoRestaurar}><Icone nome="desfazer" tamanho={14} />Restaurar</button>}
            </>
          ) : (
            <>
              <span className="pasta-data">Atualizado em {data(processo.atualizado_em)}</span>
              <span className={`pasta-pub ${online ? 'pasta-pub-online' : 'pasta-pub-offline'}`} title={online ? 'A página pública do processo está no ar' : 'A página pública do processo está fora do ar'}>{online ? 'Online' : 'Offline'}</span>
            </>
          )}
        </div>
      </div>
    </article>
  );
}
