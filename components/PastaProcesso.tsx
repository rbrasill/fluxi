'use client';
import Link from 'next/link';
import type { CSSProperties } from 'react';
import { Icone } from '@/components/Icone';

// Um processo como pasta (decisão 61), na página da área e em "Todos os processos": só o nome, a data da
// última atualização e se a página pública do processo está no ar. A pasta inteira abre o processo; a
// arquivada mostra quando foi arquivada e o botão de restaurar.

// Cores suaves (fundo claro e um miolo um pouco mais escuro); a de cada processo sai do id, então não muda.
const CORES: readonly (readonly [string, string])[] = [
  ['#fbe4ee', '#de7ba6'], // rosa
  ['#ddf3e9', '#4fb48a'], // verde
  ['#fcf0cf', '#d6a72c'], // amarelo
  ['#ddeffa', '#4ea4d4'], // azul-claro
  ['#ebe6fb', '#8f7ad6'], // lilás
  ['#e2e8fc', '#6f88e0'], // azul
  ['#fde8da', '#de8f5c'], // pêssego
  ['#dcefef', '#3f9ca3'], // azul-petróleo
];

export function corDaPasta(id: string) {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return CORES[h % CORES.length];
}

const data = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });

export type ProcessoDaPasta = { id: string; nome: string; atualizado_em: string; arquivado_em: string | null; link_publico_ativo?: boolean };

export function PastaProcesso({ processo, aoRestaurar }: { processo: ProcessoDaPasta; aoRestaurar?: () => void }) {
  const [fundo, miolo] = corDaPasta(processo.id);
  const arquivado = !!processo.arquivado_em;
  const online = !!processo.link_publico_ativo;
  return (
    <article className={`pasta-processo${arquivado ? ' arquivada' : ''}`} title={processo.nome}>
      <span className="pasta-aba" aria-hidden="true" />
      <div className="pasta-corpo">
        <div className="pasta-topo">
          <span className="pasta-cor" style={{ background: fundo, '--miolo': miolo } as CSSProperties} aria-hidden="true" />
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
