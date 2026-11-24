'use client';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ListaDeAreas } from '@/components/ListaDeAreas';
import { DialogoNome } from '@/components/DialogoNome';
import { confirmar } from '@/components/Dialogos';
import { Icone } from '@/components/Icone';
import { criarArea } from '@/lib/areas';
import { sigla } from '@/lib/iniciais';
import { atualizarOrganizacao, excluirOrganizacao, obterOrganizacao, type Organizacao } from '@/lib/organizacoes';

// Página da organização (redesign, decisão 82): as áreas em cartões (sem pasta, decisão 88), com busca, ordem e a opção de ver em lista
// (a mesma lista da tela Áreas, decisão 104).

export default function OrganizacaoPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [o, setO] = useState<Organizacao | null | undefined>(undefined);
  const [nome, setNome] = useState('');
  const [nova, setNova] = useState(false);
  const [erro, setErro] = useState('');
  const [menu, setMenu] = useState(false);

  useEffect(() => { obterOrganizacao(id).then((d) => { setO(d); setNome(d.nome); }).catch(() => setO(null)); }, [id]);

  if (o === undefined) return <div className="page"><p className="notice">Carregando…</p></div>;
  if (o === null) return <div className="page"><div className="empty"><h2>Organização não encontrada</h2><Link href="/app/organizacoes" className="btn btn-primary">Voltar</Link></div></div>;

  async function renomear() {
    if (!nome.trim() || nome === o!.nome) return;
    try { await atualizarOrganizacao(o!.id, nome.trim()); setErro(''); } catch (e) { setErro(e instanceof Error ? e.message : 'Erro'); setNome(o!.nome); }
  }

  async function excluir() {
    if (!(await confirmar({ titulo: `Excluir a organização "${o!.nome}"?`, mensagem: 'Só é possível excluir uma organização sem áreas.', acao: 'Excluir', perigo: true }))) return;
    try { await excluirOrganizacao(o!.id); router.push('/app/organizacoes'); } catch (e) { setErro(e instanceof Error ? e.message : 'Erro ao excluir'); }
  }

  const totalProcessos = o.areas.reduce((n, a) => n + a.total_processos, 0);
  const processos = (n: number) => `${n} ${n === 1 ? 'processo' : 'processos'}`;

  return (
    <div className="page pagina-organizacao">
      <Link href="/app/organizacoes" className="voltar"><Icone nome="voltar" tamanho={16} />Organizações</Link>
      <div className="page-head proc-cabecalho">
        <span className="proc-avatar avatar-organizacao" aria-hidden="true">{sigla(o.nome)}</span>
        <div className="proc-titulo">
          <input className="titulo-editavel" value={nome} onChange={(e) => setNome(e.target.value)} onBlur={renomear} aria-label="Nome da organização" />
          <p className="page-meta org-meta">Organização<span>{o.areas.length} {o.areas.length === 1 ? 'área' : 'áreas'}</span><span>{processos(totalProcessos)}</span></p>
        </div>
        <div className="actions">
          <div className="menu">
            <button className="btn btn-icon" aria-label="Mais ações" title="Mais ações" aria-haspopup="true" aria-expanded={menu} onClick={() => setMenu((m) => !m)} onBlur={(e) => { if (!e.currentTarget.parentElement?.contains(e.relatedTarget as Node)) setMenu(false); }}><Icone nome="mais-acoes" /></button>
            {menu && (
              <div className="menu-list" role="menu">
                <button type="button" role="menuitem" className="menu-perigo" onClick={() => { setMenu(false); void excluir(); }} onBlur={() => setMenu(false)}><Icone nome="lixo" tamanho={16} />Excluir organização</button>
              </div>
            )}
          </div>
          <button className="btn btn-primary" onClick={() => setNova(true)}><Icone nome="mais" />Nova área</button>
        </div>
      </div>
      {erro && <div className="aviso erro">{erro}</div>}

      {o.areas.length > 0 && <ListaDeAreas areas={o.areas} titulo="Áreas" aoNova={() => setNova(true)} />}
      {o.areas.length === 0 && (
        <>
          <div className="areas-barra"><h2>Áreas</h2></div>
          <div className="empty">
            <h2>Nenhuma área nesta organização</h2>
            <p>Crie as áreas da empresa (Comercial, Financeiro, Jurídico…) e, dentro delas, os processos.</p>
            <button className="btn btn-primary" onClick={() => setNova(true)}><Icone nome="mais" />Criar a primeira</button>
          </div>
        </>
      )}
      {nova && (
        <DialogoNome titulo="Nova área" rotulo="Nome da área" exemplo="Nome da área" aoFechar={() => setNova(false)}
          aoCriar={async (n) => { const a = await criarArea({ nome: n, organizacao_id: o.id }); router.push(`/app/areas/${a.id}`); }} />
      )}
    </div>
  );
}
