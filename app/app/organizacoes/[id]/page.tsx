'use client';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { DialogoNome } from '@/components/DialogoNome';
import { confirmar } from '@/components/Dialogos';
import { Icone } from '@/components/Icone';
import { criarArea } from '@/lib/areas';
import { corDoAvatar, sigla } from '@/lib/iniciais';
import { atualizarOrganizacao, excluirOrganizacao, obterOrganizacao, type Organizacao } from '@/lib/organizacoes';

// Página da organização (redesign, decisão 82): as áreas como pastas, com busca, ordem e a opção de ver em lista.
type Ordem = 'az' | 'za' | 'processos';
const semAcento = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

export default function OrganizacaoPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [o, setO] = useState<Organizacao | null | undefined>(undefined);
  const [nome, setNome] = useState('');
  const [nova, setNova] = useState(false);
  const [erro, setErro] = useState('');
  const [busca, setBusca] = useState('');
  const [ordem, setOrdem] = useState<Ordem>('az');
  const [vista, setVista] = useState<'pastas' | 'lista'>('pastas');
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
  const termo = semAcento(busca.trim());
  const areas = o.areas
    .filter((a) => !termo || semAcento(a.nome).includes(termo))
    .sort((a, b) => ordem === 'za' ? b.nome.localeCompare(a.nome, 'pt-BR') : ordem === 'processos' ? b.total_processos - a.total_processos || a.nome.localeCompare(b.nome, 'pt-BR') : a.nome.localeCompare(b.nome, 'pt-BR'));
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

      <div className="areas-barra">
        <h2>Áreas</h2>
        {o.areas.length > 0 && (
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
              <button type="button" aria-pressed={vista === 'pastas'} aria-selected={vista === 'pastas'} onClick={() => setVista('pastas')} aria-label="Em pastas" title="Em pastas"><Icone nome="grade" tamanho={18} /></button>
              <button type="button" aria-pressed={vista === 'lista'} aria-selected={vista === 'lista'} onClick={() => setVista('lista')} aria-label="Em lista" title="Em lista"><Icone nome="lista" tamanho={18} /></button>
            </div>
          </div>
        )}
      </div>

      {o.areas.length === 0 && (
        <div className="empty">
          <h2>Nenhuma área nesta organização</h2>
          <p>Crie as áreas da empresa (Comercial, Financeiro, Jurídico…) e, dentro delas, os processos.</p>
          <button className="btn btn-primary" onClick={() => setNova(true)}><Icone nome="mais" />Criar a primeira</button>
        </div>
      )}
      {o.areas.length > 0 && areas.length === 0 && <p className="notice">Nenhuma área com “{busca.trim()}”.</p>}

      {o.areas.length > 0 && vista === 'pastas' && (
        <div className="pastas-areas">
          {areas.map((a) => (
            <article key={a.id} className="pasta-processo pasta-area" title={a.nome}>
              <span className="pasta-aba" aria-hidden="true" />
              <div className="pasta-corpo">
                <span className={`avatar avatar-quadrado avatar-${corDoAvatar(a.id)}`} aria-hidden="true">{sigla(a.nome)}</span>
                <Link href={`/app/areas/${a.id}`} className="pasta-nome">{a.nome}</Link>
                <div className="pasta-area-rodape">
                  <Icone nome="engrenagem" tamanho={17} /><span>{processos(a.total_processos)}</span><Icone nome="avancar" tamanho={16} />
                </div>
              </div>
            </article>
          ))}
          {!termo && (
            <button type="button" className="pasta-nova" onClick={() => setNova(true)}>
              <span className="avatar avatar-quadrado avatar-indigo"><Icone nome="mais" tamanho={20} /></span>
              Nova área
            </button>
          )}
        </div>
      )}
      {o.areas.length > 0 && vista === 'lista' && areas.length > 0 && (
        <ul className="cartao areas-lista">
          {areas.map((a) => (
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
      )}
      {nova && (
        <DialogoNome titulo="Nova área" rotulo="Nome da área" exemplo="Nome da área" aoFechar={() => setNova(false)}
          aoCriar={async (n) => { const a = await criarArea({ nome: n, organizacao_id: o.id }); router.push(`/app/areas/${a.id}`); }} />
      )}
    </div>
  );
}
