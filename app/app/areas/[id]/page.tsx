'use client';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Icone } from '@/components/Icone';
import { confirmar } from '@/components/Dialogos';
import { NovoProcesso } from '@/components/NovoProcesso';
import { atualizarArea, excluirArea, obterArea, type Area } from '@/lib/areas';
import { restaurarProcesso } from '@/lib/processos';

export default function AreaPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [a, setA] = useState<Area | null | undefined>(undefined);
  const [nome, setNome] = useState('');
  const [novo, setNovo] = useState(false);
  const [erro, setErro] = useState('');
  const [aba, setAba] = useState<'ativos' | 'arquivados'>('ativos');

  const carregar = () => obterArea(id).then((d) => { setA(d); setNome(d.nome); }).catch(() => setA(null));
  useEffect(() => { void carregar(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (a === undefined) return <div className="page"><p className="notice">Carregando…</p></div>;
  if (a === null) return <div className="page"><div className="empty"><h2>Área não encontrada</h2><Link href="/app/organizacoes" className="btn btn-primary">Voltar</Link></div></div>;

  const ativos = a.processos.filter((p) => !p.arquivado_em);
  const arquivados = a.processos.filter((p) => p.arquivado_em);
  // Restaurou o último arquivado: a aba some e a lista volta aos ativos.
  const abaAtual = arquivados.length ? aba : 'ativos';
  const lista = abaAtual === 'ativos' ? ativos : arquivados;

  async function renomear() {
    if (!nome.trim() || nome === a!.nome) return;
    try { await atualizarArea(a!.id, { nome: nome.trim() }); setErro(''); } catch (e) { setErro(e instanceof Error ? e.message : 'Erro'); setNome(a!.nome); }
  }

  async function excluir() {
    if (!(await confirmar({ titulo: `Excluir a área "${a!.nome}"?`, mensagem: 'Só é possível excluir uma área sem processos (contando os arquivados).', acao: 'Excluir', perigo: true }))) return;
    try { await excluirArea(a!.id); router.push(a!.organizacao ? `/app/organizacoes/${a!.organizacao.id}` : '/app/organizacoes'); } catch (e) { setErro(e instanceof Error ? e.message : 'Erro ao excluir'); }
  }

  async function restaurar(pid: string) {
    try { await restaurarProcesso(pid); await carregar(); } catch (e) { setErro(e instanceof Error ? e.message : 'Erro ao restaurar'); }
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <nav className="migalha" aria-label="Caminho">
            <Link href="/app/organizacoes">Organizações</Link><span>›</span>
            {a.organizacao && <Link href={`/app/organizacoes/${a.organizacao.id}`}>{a.organizacao.nome}</Link>}
          </nav>
          <input className="titulo-editavel" value={nome} onChange={(e) => setNome(e.target.value)} onBlur={renomear} aria-label="Nome da área" />
          <p>{ativos.length} {ativos.length === 1 ? 'processo' : 'processos'}{arquivados.length ? ` · ${arquivados.length} ${arquivados.length === 1 ? 'arquivado' : 'arquivados'}` : ''}</p>
        </div>
        <div className="actions">
          <button className="btn btn-ghost btn-icon" aria-label="Excluir área" title="Excluir área" onClick={excluir}><Icone nome="lixo" tamanho={16} /></button>
          <button className="btn btn-primary" onClick={() => setNovo(true)}><Icone nome="mais" />Novo processo</button>
        </div>
      </div>
      {erro && <div className="aviso erro">{erro}</div>}

      {arquivados.length > 0 && (
        <div className="segmented abas-arquivo" role="tablist" aria-label="Processos">
          <button type="button" role="tab" aria-selected={abaAtual === 'ativos'} onClick={() => setAba('ativos')}>Ativos <span className="conta">{ativos.length}</span></button>
          <button type="button" role="tab" aria-selected={abaAtual === 'arquivados'} onClick={() => setAba('arquivados')}>Arquivados <span className="conta">{arquivados.length}</span></button>
        </div>
      )}

      {a.processos.length === 0 && (
        <div className="empty">
          <h2>Nenhum processo nesta área</h2>
          <p>Crie o processo e, dentro dele, desenhe o fluxograma e escreva os POPs.</p>
          <button className="btn btn-primary" onClick={() => setNovo(true)}><Icone nome="mais" />Criar o primeiro</button>
        </div>
      )}
      {a.processos.length > 0 && lista.length === 0 && <p className="notice">{abaAtual === 'ativos' ? 'Todos os processos desta área estão arquivados.' : 'Nenhum processo arquivado.'}</p>}

      <div className="lista-pops">
        {lista.map((p) => (
          <article key={p.id} className={`linha-pop linha-processo ${p.arquivado_em ? 'arquivada' : ''}`}>
            <span className="pop-icone"><Icone nome={p.arquivado_em ? 'arquivar' : 'pasta'} tamanho={20} /></span>
            <Link href={`/app/processos/${p.id}`} className="pop-nome">
              <strong>{p.nome}</strong>
              <span>{p.arquivado_em ? `Arquivado em ${new Date(p.arquivado_em).toLocaleDateString('pt-BR')}` : p.descricao || ' '}</span>
            </Link>
            <span className="contagens">
              <span title="Gravações"><Icone nome="tela" tamanho={14} />{p.total.gravacoes}</span>
              <span title="Fluxograma"><Icone nome="fluxo" tamanho={14} />{p.total.fluxogramas}</span>
              <span title="POPs"><Icone nome="pop" tamanho={14} />{p.total.pops}</span>
            </span>
            <span className="code">{p.codigo}</span>
            {p.arquivado_em && <button type="button" className="btn btn-ghost" onClick={() => restaurar(p.id)}><Icone nome="desfazer" tamanho={16} />Restaurar</button>}
          </article>
        ))}
      </div>
      {novo && <NovoProcesso areaId={a.id} aoFechar={() => setNovo(false)} />}
    </div>
  );
}
