'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Icone } from '@/components/Icone';
import { NovoProcesso } from '@/components/NovoProcesso';
import { SeloStatus } from '@/components/SeloStatus';
import { ROTULO_STATUS, formatarTempo, listarGravacoes, type GravacaoResumo } from '@/lib/gravacoes';
import { listarOrganizacoes } from '@/lib/organizacoes';
import { dataCurta, listarPops, ondeEsta, type PopResumo } from '@/lib/pops';
import { listarProcessos, type ProcessoResumo } from '@/lib/processos';

// Porta de entrada: o produto final é o POP. Mostra o que está em andamento, o que falta
// documentar e o atalho para começar um processo novo.
export default function InicioPage() {
  const [pops, setPops] = useState<PopResumo[] | null>(null);
  const [processos, setProcessos] = useState<ProcessoResumo[]>([]);
  const [gravacoes, setGravacoes] = useState<GravacaoResumo[]>([]);
  const [semOrganizacao, setSemOrganizacao] = useState(false);
  const [erro, setErro] = useState('');
  const [novo, setNovo] = useState(false);

  useEffect(() => {
    Promise.all([listarPops(), listarProcessos(), listarOrganizacoes(), listarGravacoes().catch(() => [] as GravacaoResumo[])])
      .then(([p, pr, o, g]) => { setPops(p); setProcessos(pr); setSemOrganizacao(o.length === 0); setGravacoes(g); })
      .catch((e) => { setErro(e.message); setPops([]); });
  }, []);

  if (pops === null) return <div className="page"><p className="notice">Carregando…</p></div>;

  const publicados = pops.filter((p) => p.status === 'publicado');
  const rascunhos = pops.filter((p) => p.status !== 'publicado');
  const semPop = processos.filter((p) => p.total.pops === 0);
  // Gravações pausadas ou não finalizadas também são POPs em elaboração.
  const gravacoesAbertas = gravacoes.filter((g) => g.status === 'pausada' || g.status === 'gravando' || g.status === 'interrompida');
  const continuar = (rascunhos.length ? rascunhos : pops).slice(0, 5);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Início</h1>
          <p>Documente os processos e acompanhe os POPs de cada área.</p>
        </div>
        <div className="actions">
          {!semOrganizacao && <button className="btn btn-primary" onClick={() => setNovo(true)}><Icone nome="mais" />Documentar um processo</button>}
        </div>
      </div>
      {erro && <div className="aviso erro">{erro}</div>}

      {semOrganizacao ? (
        <div className="empty">
          <h2>Comece pela organização</h2>
          <p>Cadastre a empresa e as áreas dela. Depois, cada processo de uma área vira um POP.</p>
          <Link href="/app/organizacoes" className="btn btn-primary"><Icone nome="mais" />Cadastrar organização</Link>
        </div>
      ) : (
        <>
          <div className="resumo-grid">
            <Link href="/app/pops?status=publicado" className="resumo-item">
              <strong>{publicados.length}</strong><span>{publicados.length === 1 ? 'POP publicado' : 'POPs publicados'}</span>
            </Link>
            <Link href="/app/pops?status=rascunho" className="resumo-item">
              <strong>{rascunhos.length}</strong><span>{rascunhos.length === 1 ? 'POP em rascunho' : 'POPs em rascunho'}</span>
            </Link>
            <a href="#sem-pop" className="resumo-item">
              <strong>{semPop.length}</strong><span>{semPop.length === 1 ? 'processo sem POP' : 'processos sem POP'}</span>
            </a>
          </div>

          <section className="secao-processo">
            <div className="secao-head">
              <h2><Icone nome="pop" tamanho={18} />{rascunhos.length || gravacoesAbertas.length ? 'Continue de onde parou' : 'POPs recentes'}</h2>
              <Link href="/app/pops" className="btn btn-ghost">Ver todos os POPs</Link>
            </div>
            {continuar.length === 0 && gravacoesAbertas.length === 0 && <p className="notice">Nenhum POP ainda. Use “Documentar um processo” para começar.</p>}
            <div className="lista-pops">
              {gravacoesAbertas.map((g) => (
                <Link key={g.id} href={`/app/gravacoes/${g.id}`} className="linha-pop">
                  <span className="pop-icone"><Icone nome="tela" tamanho={20} /></span>
                  <span className="pop-nome">
                    <strong>{g.nome}</strong>
                    <span>{ondeEsta({ processo: g.processo ?? null })}</span>
                    <span className="parou">Gravação {ROTULO_STATUS[g.status].toLowerCase()} · {g.duracao_ms ? formatarTempo(g.duracao_ms) : '--:--'} · {g.total_marcacoes} {g.total_marcacoes === 1 ? 'tela' : 'telas'}</span>
                  </span>
                  <span className="btn">Continuar</span>
                </Link>
              ))}
              {continuar.map((p) => (
                <Link key={p.id} href={p.status === 'rascunho' ? `/app/pops/${p.id}?retomar=1` : `/app/pops/${p.id}`} className="linha-pop">
                  <span className="pop-icone"><Icone nome="pop" tamanho={20} /></span>
                  <span className="pop-nome">
                    <strong>{p.nome}</strong>
                    <span>{ondeEsta(p)}</span>
                    {p.status === 'rascunho' && p.posicao && <span className="parou">Parou em: {p.posicao.rotulo}</span>}
                  </span>
                  <SeloStatus status={p.status} />
                  <span className="notice">{dataCurta(p.atualizado_em)}</span>
                  {p.status === 'rascunho' && <span className="btn">Continuar</span>}
                </Link>
              ))}
            </div>
          </section>

          <section className="secao-processo" id="sem-pop">
            <div className="secao-head">
              <h2><Icone nome="pasta" tamanho={18} />Processos sem POP</h2>
              <Link href="/app/processos" className="btn btn-ghost">Ver todos os processos</Link>
            </div>
            {semPop.length === 0 && <p className="notice">Todos os processos já têm POP.</p>}
            <div className="lista-pops">
              {semPop.slice(0, 8).map((p) => (
                <Link key={p.id} href={`/app/processos/${p.id}`} className="linha-pop">
                  <span className="pop-icone"><Icone nome="pasta" tamanho={20} /></span>
                  <span className="pop-nome"><strong>{p.nome}</strong><span>{[p.area?.organizacao?.nome, p.area?.nome].filter(Boolean).join(' · ')}</span></span>
                  <span className="btn">Documentar</span>
                </Link>
              ))}
            </div>
          </section>
        </>
      )}

      {novo && <NovoProcesso aoFechar={() => setNovo(false)} />}
    </div>
  );
}
