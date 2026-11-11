'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Icone } from '@/components/Icone';
import { ConversaEmLigacao } from '@/components/entrevista/ConversaEmLigacao';
import { souEu, useEu } from '@/lib/auth/eu';
import { useAcompanharEntrevista } from '@/lib/entrevista/acompanhar';
import { Consultas, DetalhesMetricas, Diagnostico, PainelMetricas } from '@/components/entrevista/Metricas';
import { ROTULO_STATUS } from '@/lib/entrevista/topicos';
import { obterEntrevista, type Entrevista } from '@/lib/entrevistas';

// Uma entrevista no Painel da Maia (decisão 52): os indicadores, os custos, as consultas e o diagnóstico da
// sessão de voz. A conversa e o resultado ficam na tela da entrevista. Enquanto a pessoa está na ligação, a página
// fica fechada (as consultas e os erros guardam trechos da conversa) e abre sozinha quando a ligação termina (decisão 69).
// Arquivar e excluir são só dentro da entrevista (decisão 72): daqui, o botão "Abrir a entrevista" leva até lá.

const data = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

export default function MaiaEntrevistaPage() {
  const { id } = useParams<{ id: string }>();
  const [e, setE] = useState<Entrevista | null | undefined>(undefined);
  const eu = useEu();
  useEffect(() => { obterEntrevista(id).then(setE).catch(() => setE(null)); }, [id]);
  useAcompanharEntrevista(id, e, !!e && eu !== null && !souEu(eu, e.entrevistado_id), () => obterEntrevista(id).then(setE).catch(() => {}));

  if (e === undefined) return <div className="page"><p className="notice">Carregando…</p></div>;
  if (e === null) return <div className="page"><div className="empty"><h2>Entrevista não encontrada</h2><Link href="/app/maia" className="btn btn-primary">Voltar ao painel</Link></div></div>;

  if (e.conteudo_oculto) {
    return (
      <div className="page page-estreita">
        <div className="page-head">
          <div>
            <nav className="migalha" aria-label="Caminho"><Link href="/app/maia">Painel da Maia</Link></nav>
            <h1>{e.tema || 'Entrevista'}</h1>
            <p className="page-meta">{e.entrevistado ? `Entrevistado: ${e.entrevistado} · ` : ''}{data(e.criado_em)} · Em andamento</p>
          </div>
        </div>
        <ConversaEmLigacao entrevistado={e.entrevistado} voltar={{ href: '/app/maia', rotulo: 'Voltar ao painel' }} />
      </div>
    );
  }

  const m = e.metricas ?? {};
  const situacao = `${e.status === 'em_andamento' ? (e.em_ligacao ? 'Em andamento' : 'Pausada') : ROTULO_STATUS[e.status]}${e.arquivado_em ? ' · arquivada' : ''}`;
  return (
    <div className="page page-estreita">
      <div className="page-head">
        <div>
          <nav className="migalha" aria-label="Caminho"><Link href="/app/maia">Painel da Maia</Link></nav>
          <h1>{e.tema || 'Entrevista'}</h1>
          <p className="page-meta">{e.entrevistado ? `Entrevistado: ${e.entrevistado} · ` : ''}{data(e.criado_em)} · {situacao} · {e.turnos.length} {e.turnos.length === 1 ? 'fala' : 'falas'}</p>
        </div>
        <div className="actions">
          <Link href={`/app/entrevistas/${e.id}`} className="btn"><Icone nome="conversa" tamanho={16} />Abrir a entrevista</Link>
        </div>
      </div>

      <div className="cartao">
        <h3 className="sem-margem">Indicadores e custos</h3>
        <PainelMetricas metricas={m} />
        <DetalhesMetricas m={m} />
      </div>

      {m.consultas?.length ? <div className="cartao"><Consultas lista={m.consultas} aberto /></div> : null}

      <Diagnostico m={m} sessoes={e.sessoes} />
    </div>
  );
}
