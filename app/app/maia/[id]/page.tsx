'use client';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Icone } from '@/components/Icone';
import { avisar, confirmar } from '@/components/Dialogos';
import { Consultas, DetalhesMetricas, Diagnostico, PainelMetricas } from '@/components/entrevista/Metricas';
import { ROTULO_STATUS } from '@/lib/entrevista/topicos';
import { confirmacaoDeExclusao, excluirEntrevista, obterEntrevista, type Entrevista } from '@/lib/entrevistas';

// Uma entrevista no Painel da Maia (decisão 52): os indicadores, os custos, as consultas e o diagnóstico da
// sessão de voz. A conversa e o resultado ficam na tela da entrevista.

const data = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

export default function MaiaEntrevistaPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [e, setE] = useState<Entrevista | null | undefined>(undefined);
  const [excluindo, setExcluindo] = useState(false);
  useEffect(() => { obterEntrevista(id).then(setE).catch(() => setE(null)); }, [id]);

  if (e === undefined) return <div className="page"><p className="notice">Carregando…</p></div>;
  if (e === null) return <div className="page"><div className="empty"><h2>Entrevista não encontrada</h2><Link href="/app/maia" className="btn btn-primary">Voltar ao painel</Link></div></div>;

  async function excluir() {
    if (!e || !(await confirmar(confirmacaoDeExclusao({ status: e.status, falas: e.turnos.length, entrevistado: e.entrevistado })))) return;
    setExcluindo(true);
    try { await excluirEntrevista(e.id); router.push('/app/maia'); } catch (err) { setExcluindo(false); void avisar('Não foi possível excluir a entrevista.', err instanceof Error ? err.message : 'Tente de novo em instantes.'); }
  }

  const m = e.metricas ?? {};
  const situacao = e.status === 'em_andamento' && e.turnos.length > 0 ? 'Pausada' : ROTULO_STATUS[e.status];
  return (
    <div className="page page-estreita">
      <div className="page-head">
        <div>
          <nav className="migalha" aria-label="Caminho"><Link href="/app/maia">Painel da Maia</Link></nav>
          <h1>{e.tema || 'Entrevista'}</h1>
          <p>{e.entrevistado ? `Entrevistado: ${e.entrevistado} · ` : ''}{data(e.criado_em)} · {situacao} · {e.turnos.length} {e.turnos.length === 1 ? 'fala' : 'falas'}</p>
        </div>
        <div className="actions">
          <button type="button" className="btn btn-ghost btn-excluir" disabled={excluindo} onClick={() => void excluir()} title="Exclui a entrevista inteira: conversa, áudio e resultado"><Icone nome="lixo" tamanho={16} />{e.status === 'convidada' ? 'Cancelar convite' : 'Excluir'}</button>
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
