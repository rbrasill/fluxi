'use client';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Icone } from '@/components/Icone';
import { NovoProcesso } from '@/components/NovoProcesso';
import { atualizarArea, excluirArea, obterArea, type Area } from '@/lib/areas';

export default function AreaPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [a, setA] = useState<Area | null | undefined>(undefined);
  const [nome, setNome] = useState('');
  const [novo, setNovo] = useState(false);
  const [erro, setErro] = useState('');

  useEffect(() => { obterArea(id).then((d) => { setA(d); setNome(d.nome); }).catch(() => setA(null)); }, [id]);

  if (a === undefined) return <div className="page"><p className="notice">Carregando…</p></div>;
  if (a === null) return <div className="page"><div className="empty"><h2>Área não encontrada</h2><Link href="/app/areas" className="btn btn-primary">Voltar</Link></div></div>;

  async function renomear() {
    if (!nome.trim() || nome === a!.nome) return;
    try { await atualizarArea(a!.id, { nome: nome.trim() }); setErro(''); } catch (e) { setErro(e instanceof Error ? e.message : 'Erro'); setNome(a!.nome); }
  }

  async function excluir() {
    if (!confirm(`Excluir a área "${a!.nome}"?`)) return;
    try { await excluirArea(a!.id); router.push('/app/areas'); } catch (e) { setErro(e instanceof Error ? e.message : 'Erro ao excluir'); }
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <Link href="/app/areas" className="voltar"><Icone nome="voltar" tamanho={16} />Áreas</Link>
          <input className="titulo-editavel" value={nome} onChange={(e) => setNome(e.target.value)} onBlur={renomear} aria-label="Nome da área" />
          <p>{a.processos.length} {a.processos.length === 1 ? 'processo' : 'processos'}</p>
        </div>
        <div className="actions">
          <button className="btn btn-ghost btn-icon" aria-label="Excluir área" title="Excluir área" onClick={excluir}><Icone nome="lixo" tamanho={16} /></button>
          <button className="btn btn-primary" onClick={() => setNovo(true)}><Icone nome="mais" />Novo processo</button>
        </div>
      </div>
      {erro && <div className="aviso erro">{erro}</div>}
      {a.processos.length === 0 && (
        <div className="empty">
          <h2>Nenhum processo nesta área</h2>
          <p>Crie o processo e, dentro dele, grave a tela, gere o fluxograma e o POP.</p>
          <button className="btn btn-primary" onClick={() => setNovo(true)}><Icone nome="mais" />Criar o primeiro</button>
        </div>
      )}
      <div className="lista-pops">
        {a.processos.map((p) => (
          <Link key={p.id} href={`/app/processos/${p.id}`} className="linha-pop linha-processo">
            <span className="pop-icone"><Icone nome="pasta" tamanho={20} /></span>
            <span className="pop-nome"><strong>{p.nome}</strong><span>{p.descricao || ' '}</span></span>
            <span className="contagens">
              <span title="Gravações"><Icone nome="tela" tamanho={14} />{p.total.gravacoes}</span>
              <span title="Fluxogramas"><Icone nome="fluxo" tamanho={14} />{p.total.fluxogramas}</span>
              <span title="POPs"><Icone nome="pop" tamanho={14} />{p.total.pops}</span>
            </span>
            <span className="code">{p.codigo}</span>
          </Link>
        ))}
      </div>
      {novo && <NovoProcesso areaId={a.id} aoFechar={() => setNovo(false)} />}
    </div>
  );
}
