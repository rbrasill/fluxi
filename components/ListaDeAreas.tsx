'use client';
import Link from 'next/link';
import { useState } from 'react';
import { CartaoArea } from '@/components/CartaoArea';
import { Icone } from '@/components/Icone';
import { corDoAvatar, sigla } from '@/lib/iniciais';

// As áreas com busca, ordem e a opção de ver em cartões ou em lista (decisão 82). Usada na página da organização
// e na tela Áreas do menu (decisão 104), para as duas serem iguais. Com mais de uma organização, a tela Áreas
// agrupa por organização; a busca e a ordem valem para todos os grupos.

export type AreaNaLista = { id: string; nome: string; total_processos: number; organizacao?: { id: string; nome: string } | null };
type Ordem = 'az' | 'za' | 'processos';
const semAcento = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const processos = (n: number) => `${n} ${n === 1 ? 'processo' : 'processos'}`;

export function ListaDeAreas({ areas, titulo, agruparPorOrganizacao = false, aoNova }: {
  areas: AreaNaLista[];
  titulo: string;
  agruparPorOrganizacao?: boolean;
  /** Mostra o cartão "Nova área" no fim da grade (sem busca e sem grupos). */
  aoNova?: () => void;
}) {
  const [busca, setBusca] = useState('');
  const [ordem, setOrdem] = useState<Ordem>('az');
  const [vista, setVista] = useState<'cartoes' | 'lista'>('cartoes');

  const termo = semAcento(busca.trim());
  const visiveis = areas
    .filter((a) => !termo || semAcento(a.nome).includes(termo))
    .sort((a, b) => ordem === 'za' ? b.nome.localeCompare(a.nome, 'pt-BR') : ordem === 'processos' ? b.total_processos - a.total_processos || a.nome.localeCompare(b.nome, 'pt-BR') : a.nome.localeCompare(b.nome, 'pt-BR'));

  // Grupos por organização, na ordem alfabética delas; a ordem das áreas dentro de cada grupo é a escolhida.
  const grupos = new Map<string, { org: AreaNaLista['organizacao']; lista: AreaNaLista[] }>();
  for (const a of visiveis) {
    const chave = a.organizacao?.nome ?? 'Sem organização';
    grupos.set(chave, { org: a.organizacao ?? null, lista: [...(grupos.get(chave)?.lista ?? []), a] });
  }
  const totalOrgs = new Set(areas.map((a) => a.organizacao?.id ?? '')).size;
  const agrupar = agruparPorOrganizacao && totalOrgs > 1;
  const blocos = agrupar
    ? [...grupos.entries()].sort(([x], [y]) => x.localeCompare(y, 'pt-BR')).map(([nome, g]) => ({ nome, org: g.org, lista: g.lista }))
    : [{ nome: '', org: null, lista: visiveis }];

  const conteudo = (lista: AreaNaLista[], comNova: boolean) => vista === 'cartoes'
    ? (
      <div className="grade-areas">
        {lista.map((a) => <CartaoArea key={a.id} id={a.id} nome={a.nome} totalProcessos={a.total_processos} />)}
        {comNova && aoNova && (
          <button type="button" className="cartao-area-nova" onClick={aoNova}>
            <span className="cartao-area-icone avatar-indigo"><Icone nome="mais" tamanho={20} /></span>
            Nova área
          </button>
        )}
      </div>
    )
    : (
      <ul className="cartao areas-lista">
        {lista.map((a) => (
          <li key={a.id}>
            <Link href={`/app/areas/${a.id}`}>
              <span className={`avatar avatar-quadrado avatar-${corDoAvatar(a.id)}`} aria-hidden="true">{sigla(a.nome)}</span>
              <strong>{a.nome}</strong>
              <span className="areas-lista-conta"><Icone nome="engrenagem" tamanho={17} />{processos(a.total_processos)}</span>
              <Icone nome="avancar" tamanho={16} />
            </Link>
          </li>
        ))}
      </ul>
    );

  return (
    <>
      <div className="areas-barra">
        <h2>{titulo}</h2>
        {areas.length > 0 && (
          <div className="areas-controles">
            <label className="campo-busca busca-pops">
              <Icone nome="busca" tamanho={18} />
              <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar área" aria-label="Buscar área" />
            </label>
            <select className="select-ordem" value={ordem} onChange={(e) => setOrdem(e.target.value as Ordem)} aria-label="Ordenar áreas">
              <option value="az">Nome (A–Z)</option>
              <option value="za">Nome (Z–A)</option>
              <option value="processos">Mais processos</option>
            </select>
            <div className="segmented alternar-vista" role="group" aria-label="Como mostrar as áreas">
              <button type="button" aria-pressed={vista === 'cartoes'} aria-selected={vista === 'cartoes'} onClick={() => setVista('cartoes')} aria-label="Em cartões" title="Em cartões"><Icone nome="grade" tamanho={18} /></button>
              <button type="button" aria-pressed={vista === 'lista'} aria-selected={vista === 'lista'} onClick={() => setVista('lista')} aria-label="Em lista" title="Em lista"><Icone nome="lista" tamanho={18} /></button>
            </div>
          </div>
        )}
      </div>
      {areas.length > 0 && visiveis.length === 0 && <p className="notice">Nenhuma área com “{busca.trim()}”.</p>}
      {visiveis.length > 0 && blocos.map((b) => agrupar
        ? (
          <section key={b.nome} className="secao-areas" aria-label={b.nome}>
            <h3 className="secao-areas-titulo">{b.org ? <Link href={`/app/organizacoes/${b.org.id}`}>{b.nome}</Link> : b.nome}</h3>
            {conteudo(b.lista, false)}
          </section>
        )
        : <div key="todas">{conteudo(b.lista, !termo)}</div>)}
    </>
  );
}
