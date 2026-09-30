'use client';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { DialogoNome } from '@/components/DialogoNome';
import { Icone } from '@/components/Icone';
import { criarArea } from '@/lib/areas';
import { atualizarOrganizacao, excluirOrganizacao, obterOrganizacao, type Organizacao } from '@/lib/organizacoes';

export default function OrganizacaoPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [o, setO] = useState<Organizacao | null | undefined>(undefined);
  const [nome, setNome] = useState('');
  const [nova, setNova] = useState(false);
  const [erro, setErro] = useState('');

  useEffect(() => { obterOrganizacao(id).then((d) => { setO(d); setNome(d.nome); }).catch(() => setO(null)); }, [id]);

  if (o === undefined) return <div className="page"><p className="notice">Carregando…</p></div>;
  if (o === null) return <div className="page"><div className="empty"><h2>Organização não encontrada</h2><Link href="/app/organizacoes" className="btn btn-primary">Voltar</Link></div></div>;

  async function renomear() {
    if (!nome.trim() || nome === o!.nome) return;
    try { await atualizarOrganizacao(o!.id, nome.trim()); setErro(''); } catch (e) { setErro(e instanceof Error ? e.message : 'Erro'); setNome(o!.nome); }
  }

  async function excluir() {
    if (!confirm(`Excluir a organização "${o!.nome}"?`)) return;
    try { await excluirOrganizacao(o!.id); router.push('/app/organizacoes'); } catch (e) { setErro(e instanceof Error ? e.message : 'Erro ao excluir'); }
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <Link href="/app/organizacoes" className="voltar"><Icone nome="voltar" tamanho={16} />Organizações</Link>
          <input className="titulo-editavel" value={nome} onChange={(e) => setNome(e.target.value)} onBlur={renomear} aria-label="Nome da organização" />
          <p>{o.areas.length} {o.areas.length === 1 ? 'área' : 'áreas'}</p>
        </div>
        <div className="actions">
          <button className="btn btn-ghost btn-icon" aria-label="Excluir organização" title="Excluir organização" onClick={excluir}><Icone nome="lixo" tamanho={16} /></button>
          <button className="btn btn-primary" onClick={() => setNova(true)}><Icone nome="mais" />Nova área</button>
        </div>
      </div>
      {erro && <div className="aviso erro">{erro}</div>}
      {o.areas.length === 0 && (
        <div className="empty">
          <h2>Nenhuma área nesta organização</h2>
          <p>Crie as áreas da empresa (Comercial, Financeiro, Jurídico…) e, dentro delas, os processos.</p>
          <button className="btn btn-primary" onClick={() => setNova(true)}><Icone nome="mais" />Criar a primeira</button>
        </div>
      )}
      <div className="grid grid-areas">
        {o.areas.map((a) => (
          <Link key={a.id} href={`/app/areas/${a.id}`} className="card card-area">
            <span className="pop-icone"><Icone nome="areas" tamanho={22} /></span>
            <strong>{a.nome}</strong>
            <span className="notice">{a.total_processos} {a.total_processos === 1 ? 'processo' : 'processos'}</span>
          </Link>
        ))}
      </div>
      {nova && (
        <DialogoNome titulo="Nova área" rotulo="Nome da área" exemplo="Ex.: Comercial" aoFechar={() => setNova(false)}
          aoCriar={async (n) => { const a = await criarArea({ nome: n, organizacao_id: o.id }); router.push(`/app/areas/${a.id}`); }} />
      )}
    </div>
  );
}
