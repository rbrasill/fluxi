'use client';
import Link from 'next/link';
import { useState, type CSSProperties, type ReactNode } from 'react';
import { Icone } from '@/components/Icone';
import { PastaProcesso, corDaPasta, type ProcessoDaPasta } from '@/components/PastaProcesso';

// Os processos da área com busca, ordem e a opção de ver em pastas ou em lista (decisão 127): os mesmos controles
// da lista de áreas (decisão 82), para as duas telas funcionarem igual. A busca e a ordem valem para a aba aberta
// (ativos ou arquivados), que fica entre a barra e a lista.

export type ProcessoNaLista = ProcessoDaPasta & { codigo?: string; total?: { pops: number } };
type Ordem = 'az' | 'za' | 'recentes' | 'pops';
const semAcento = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const data = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
const porNome = (a: ProcessoNaLista, b: ProcessoNaLista) => a.nome.localeCompare(b.nome, 'pt-BR');

export function ListaDeProcessos({ processos, titulo, entre, vazio, aoRestaurar }: {
  processos: ProcessoNaLista[];
  titulo: string;
  /** O que fica entre a barra e a lista (as abas de ativos e arquivados). */
  entre?: ReactNode;
  /** O aviso quando a aba aberta não tem processos. */
  vazio?: ReactNode;
  aoRestaurar?: (id: string) => void;
}) {
  const [busca, setBusca] = useState('');
  const [ordem, setOrdem] = useState<Ordem>('az');
  const [vista, setVista] = useState<'cartoes' | 'lista'>('cartoes');
  const comPops = processos.some((p) => p.total);

  const termo = semAcento(busca.trim());
  const visiveis = processos
    .filter((p) => !termo || semAcento(p.nome).includes(termo) || semAcento(p.codigo ?? '').includes(termo))
    .sort((a, b) => ordem === 'za' ? porNome(b, a)
      : ordem === 'recentes' ? b.atualizado_em.localeCompare(a.atualizado_em) || porNome(a, b)
      : ordem === 'pops' ? (b.total?.pops ?? 0) - (a.total?.pops ?? 0) || porNome(a, b)
      : porNome(a, b));

  return (
    <>
      <div className="areas-barra">
        <h2>{titulo}</h2>
        {processos.length > 0 && (
          <div className="areas-controles">
            <label className="campo-busca busca-pops">
              <Icone nome="busca" tamanho={18} />
              <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar processo" aria-label="Buscar processo" />
            </label>
            <select className="select-ordem" value={ordem} onChange={(e) => setOrdem(e.target.value as Ordem)} aria-label="Ordenar processos">
              <option value="az">Nome (A–Z)</option>
              <option value="za">Nome (Z–A)</option>
              <option value="recentes">Atualizados recentemente</option>
              {comPops && <option value="pops">Mais POPs</option>}
            </select>
            <div className="segmented alternar-vista" role="group" aria-label="Como mostrar os processos">
              <button type="button" aria-pressed={vista === 'cartoes'} aria-selected={vista === 'cartoes'} onClick={() => setVista('cartoes')} aria-label="Em pastas" title="Em pastas"><Icone nome="grade" tamanho={18} /></button>
              <button type="button" aria-pressed={vista === 'lista'} aria-selected={vista === 'lista'} onClick={() => setVista('lista')} aria-label="Em lista" title="Em lista"><Icone nome="lista" tamanho={18} /></button>
            </div>
          </div>
        )}
      </div>
      {entre}
      {processos.length === 0 && vazio}
      {processos.length > 0 && visiveis.length === 0 && <p className="notice">Nenhum processo com “{busca.trim()}”.</p>}
      {visiveis.length > 0 && (vista === 'cartoes'
        ? (
          <div className="pastas-processos">
            {visiveis.map((p) => <PastaProcesso key={p.id} processo={p} aoRestaurar={p.arquivado_em && aoRestaurar ? () => aoRestaurar(p.id) : undefined} />)}
          </div>
        )
        : (
          <ul className="cartao processos-lista">
            {visiveis.map((p) => {
              const [fundo, miolo] = corDaPasta(p.id);
              const online = !!p.link_publico_ativo;
              return (
                <li key={p.id} className={p.arquivado_em ? 'arquivada' : undefined}>
                  <Link href={`/app/processos/${p.id}`}>
                    <span className="pasta-cor" style={{ background: fundo, '--miolo': miolo } as CSSProperties} aria-hidden="true" />
                    <strong>{p.nome}</strong>
                    <span className="processos-lista-meta">
                      <span className="processos-lista-data">{p.arquivado_em ? `Arquivado em ${data(p.arquivado_em)}` : `Atualizado em ${data(p.atualizado_em)}`}</span>
                      {!p.arquivado_em && <span className={`pasta-pub ${online ? 'pasta-pub-online' : 'pasta-pub-offline'}`} title={online ? 'A página pública do processo está no ar' : 'A página pública do processo está fora do ar'}>{online ? 'Online' : 'Offline'}</span>}
                    </span>
                    <Icone nome="avancar" tamanho={16} />
                  </Link>
                  {p.arquivado_em && aoRestaurar && (
                    <button type="button" className="btn btn-ghost processos-lista-restaurar" onClick={() => aoRestaurar(p.id)}><Icone nome="desfazer" tamanho={14} />Restaurar</button>
                  )}
                </li>
              );
            })}
          </ul>
        ))}
    </>
  );
}
