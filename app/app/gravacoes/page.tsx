'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Icone } from '@/components/Icone';
import { excluirGravacao, formatarTempo, listarGravacoes, type GravacaoResumo } from '@/lib/gravacoes';

const ROTULO: Record<string, string> = { gravando: 'Gravando', pronta: 'Pronta', interrompida: 'Interrompida', erro: 'Envio incompleto' };

function status(g: GravacaoResumo) {
  // Gravação que ficou "gravando" por horas foi interrompida (aba fechada no meio).
  if (g.status === 'gravando' && Date.now() - new Date(g.criado_em).getTime() > 6 * 3600_000) return 'interrompida';
  return g.status;
}

export default function GravacoesPage() {
  const [itens, setItens] = useState<GravacaoResumo[] | null>(null);
  const [erro, setErro] = useState('');

  const atualizar = () => listarGravacoes().then(setItens).catch((e) => { setErro(e.message); setItens([]); });
  useEffect(() => { atualizar(); }, []);

  async function onExcluir(g: GravacaoResumo) {
    if (!confirm(`Excluir "${g.nome}", com o vídeo e as telas marcadas? Essa ação não pode ser desfeita.`)) return;
    await excluirGravacao(g.id);
    atualizar();
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Gravações</h1>
          <p>Grave a tela do sistema narrando o processo e marque as telas que vão para o POP.</p>
        </div>
        <div className="actions">
          <Link href="/app/gravacoes/nova" className="btn btn-gravar"><span className="rec-dot" />Nova gravação</Link>
        </div>
      </div>
      {erro && <div className="aviso erro">{erro}</div>}
      {itens === null && <p className="notice">Carregando…</p>}
      {itens?.length === 0 && !erro && (
        <div className="empty">
          <h2>Nenhuma gravação ainda</h2>
          <p>Mostre o processo acontecendo no sistema. Cada tela que você marcar vira um passo ilustrado no POP.</p>
          <Link href="/app/gravacoes/nova" className="btn btn-gravar"><span className="rec-dot" />Gravar a primeira</Link>
        </div>
      )}
      <div className="grid">
        {itens?.map((g) => {
          const st = status(g);
          return (
            <article key={g.id} className="card">
              <Link href={`/app/gravacoes/${g.id}`} className="card-thumb" aria-label={`Abrir ${g.nome}`}>
                <Icone nome="tela" tamanho={40} />
                <span className={`tag-status st-${st}`}>{ROTULO[st] ?? st}</span>
              </Link>
              <div className="card-body">
                <Link href={`/app/gravacoes/${g.id}`} className="card-title">{g.nome}</Link>
                <div className="card-meta">
                  <span className="code">{g.duracao_ms ? formatarTempo(g.duracao_ms) : '--:--'}</span>
                  <span>{g.total_marcacoes} {g.total_marcacoes === 1 ? 'tela' : 'telas'}</span>
                  <span>{new Date(g.criado_em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</span>
                  <span className="card-actions">
                    <button className="btn btn-ghost btn-icon" aria-label="Excluir" title="Excluir" onClick={() => onExcluir(g)}><Icone nome="lixo" tamanho={16} /></button>
                  </span>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
