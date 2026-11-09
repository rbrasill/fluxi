'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Icone } from '@/components/Icone';
import { avisar, confirmar } from '@/components/Dialogos';
import { ehAdmin, ehGestor, souEu, useEu } from '@/lib/auth/eu';
import { confirmacaoDeExclusao, excluirEntrevista, listarEntrevistas, situacaoDaEntrevista, type EntrevistaResumo } from '@/lib/entrevistas';

// Entrevistas com a Maia (decisões 41 e 53): nascem por convite, dentro do processo. Aqui, as da pessoa logada
// primeiro (as que esperam por ela em destaque) e depois as demais. Sem custos nem indicadores (decisão 52).

const data = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const duracao = (s: number) => (s >= 60 ? `${Math.round(s / 60)} min` : `${Math.round(s)} s`);
const CLASSE_SITUACAO: Record<string, string> = { convidada: 'selo-convidada', em_andamento: 'selo-andamento', processando: 'selo-processando', concluida: 'selo-concluida', erro: 'selo-erro' };

export default function EntrevistasPage() {
  const eu = useEu();
  const gestor = ehGestor(eu);
  const admin = ehAdmin(eu);
  const [lista, setLista] = useState<EntrevistaResumo[] | null>(null);

  const carregar = () => listarEntrevistas().then(setLista).catch(() => setLista([]));
  useEffect(() => { void carregar(); }, []);

  async function excluir(x: EntrevistaResumo) {
    if (!(await confirmar(confirmacaoDeExclusao(x)))) return;
    try { await excluirEntrevista(x.id); await carregar(); } catch (e) { void avisar('Não foi possível excluir a entrevista.', e instanceof Error ? e.message : 'Tente de novo em instantes.'); }
  }

  const aberta = (x: EntrevistaResumo) => x.status === 'convidada' || x.status === 'em_andamento';
  const minhas = (lista ?? []).filter((x) => eu?.enabled && souEu(eu, x.entrevistado_id));
  const outras = (lista ?? []).filter((x) => !minhas.includes(x));
  const ordem = (a: EntrevistaResumo, b: EntrevistaResumo) => Number(aberta(b)) - Number(aberta(a));

  const linha = (x: EntrevistaResumo) => {
    const minha = souEu(eu, x.entrevistado_id);
    return (
      <article key={x.id} className="linha-pop" data-status={x.status}>
        <span className="pop-icone icone-entrevista"><Icone nome="conversa" tamanho={20} /></span>
        <Link href={`/app/entrevistas/${x.id}`} className="pop-nome">
          <strong>{x.processo?.nome ?? x.tema ?? 'Entrevista'}</strong>
          <span>{x.entrevistado ? `${x.entrevistado} · ` : ''}{data(x.convidado_em ?? x.criado_em)}{x.falas > 0 ? ` · ${x.falas} ${x.falas === 1 ? 'fala' : 'falas'}` : ''}{x.duracao_s ? ` · ${duracao(x.duracao_s)}` : ''}</span>
        </Link>
        <span className={`selo-status ${CLASSE_SITUACAO[x.status] ?? ''}`}>{situacaoDaEntrevista(x)}</span>
        {((gestor && x.status === 'convidada') || (admin && x.status !== 'convidada')) && (
          <button type="button" className="btn btn-ghost btn-excluir" onClick={() => excluir(x)} title={x.status === 'convidada' ? 'Cancela o convite' : 'Exclui a entrevista inteira: conversa, áudio e resultado'}><Icone nome="lixo" tamanho={16} />{x.status === 'convidada' ? 'Cancelar' : 'Excluir'}</button>
        )}
        {aberta(x) && minha
          ? <Link className="btn btn-primary" href={`/app/entrevistas/${x.id}`}><Icone nome="microfone" tamanho={16} />{x.falas > 0 ? 'Continuar' : 'Ligar para a Maia'}</Link>
          : <Link className="btn btn-primary" href={`/app/entrevistas/${x.id}`}>Abrir</Link>}
      </article>
    );
  };

  return (
    <div className="page page-estreita">
      <div className="page-head">
        <div>
          <h1>Entrevista com IA</h1>
          <p>A Maia entrevista por voz quem executa um processo, como numa ligação, e no fim escreve a descrição, uma ficha e o que ficou em aberto. As entrevistas são criadas por convite, dentro de cada processo. Ainda em teste: não cria nem altera processos.</p>
        </div>
      </div>

      {lista === null && <p className="notice">Carregando…</p>}
      {lista?.length === 0 && (
        <div className="empty">
          <h2>Nenhuma entrevista ainda</h2>
          <p>{gestor ? 'Para entrevistar alguém, abra o processo e clique em "Convidar para entrevista".' : 'Quando alguém convidar você para uma entrevista com a Maia, ela aparece aqui e você recebe um e-mail.'}</p>
          {gestor && <Link href="/app/areas" className="btn btn-primary">Ir para as áreas</Link>}
        </div>
      )}

      {minhas.length > 0 && (
        <section className="secao-processo">
          <div className="secao-head"><h2><Icone nome="microfone" tamanho={18} />Suas entrevistas</h2></div>
          <div className="lista-pops lista-entrevistas">{[...minhas].sort(ordem).map(linha)}</div>
        </section>
      )}
      {outras.length > 0 && (
        <section className="secao-processo">
          <div className="secao-head"><h2><Icone nome="conversa" tamanho={18} />{minhas.length ? 'Outras entrevistas' : 'Entrevistas'}</h2></div>
          <div className="lista-pops lista-entrevistas">{[...outras].sort(ordem).map(linha)}</div>
        </section>
      )}
    </div>
  );
}
