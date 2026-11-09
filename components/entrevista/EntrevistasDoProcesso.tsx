'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Icone } from '@/components/Icone';
import { avisar, confirmar } from '@/components/Dialogos';
import { Convidar } from '@/components/entrevista/Convidar';
import { ehGestor, souEu, useEu } from '@/lib/auth/eu';
import { excluirEntrevista, listarEntrevistasDoProcesso, reenviarConvite, situacaoDaEntrevista, type EntrevistaDoProcesso, type ResultadoConvite } from '@/lib/entrevistas';

// A seção "Entrevistas com a Maia" da página do processo (decisão 53): quem foi convidado, em que pé está cada
// conversa e o atalho para o resultado. Gestores e administradores convidam, reenviam e cancelam convites;
// a pessoa convidada liga para a Maia a partir daqui.

const data = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
const duracao = (s: number) => (s >= 60 ? `${Math.round(s / 60)} min` : `${Math.round(s)} s`);
const msg = (e: unknown) => (e instanceof Error ? e.message : 'Tente de novo em instantes.');
const CLASSE_SITUACAO: Record<string, string> = { convidada: 'selo-convidada', em_andamento: 'selo-andamento', processando: 'selo-processando', concluida: 'selo-concluida', erro: 'selo-erro' };

export function EntrevistasDoProcesso({ processoId, processoNome, arquivado }: { processoId: string; processoNome: string; arquivado: boolean }) {
  const eu = useEu();
  const gestor = ehGestor(eu);
  const [lista, setLista] = useState<EntrevistaDoProcesso[] | null>(null);
  const [convidando, setConvidando] = useState(false);
  const [aviso, setAviso] = useState('');
  const [ocupado, setOcupado] = useState('');

  const carregar = () => listarEntrevistasDoProcesso(processoId).then(setLista).catch(() => setLista([]));
  useEffect(() => { void carregar(); }, [processoId]); // eslint-disable-line react-hooks/exhaustive-deps

  function convidou(r: ResultadoConvite) {
    setConvidando(false);
    void carregar();
    const semEmail = r.criadas.filter((c) => !c.email_enviado).map((c) => c.pessoa);
    const partes: string[] = [];
    if (r.criadas.length) partes.push(`${r.criadas.length === 1 ? 'Convite enviado' : `${r.criadas.length} convites enviados`} para ${r.criadas.map((c) => c.pessoa).join(', ')}.`);
    if (!r.carteiro_configurado && r.criadas.length) partes.push('O envio de convites por e-mail ainda não está configurado (CONVITE_MAILER_URL e CONVITE_MAILER_SECRET na Vercel): avise as pessoas por outro meio ou configure e use "Reenviar convite".');
    else if (semEmail.length) partes.push(`O e-mail de ${semEmail.join(', ')} não pôde ser enviado: use "Reenviar convite".`);
    if (r.repetidas.length) partes.push(`${r.repetidas.join(', ')} já ${r.repetidas.length === 1 ? 'tinha' : 'tinham'} entrevista aberta neste processo.`);
    setAviso(partes.join(' '));
  }

  async function reenviar(x: EntrevistaDoProcesso) {
    setOcupado(x.id);
    try { await reenviarConvite(x.id); setAviso(`Convite reenviado para ${x.entrevistado ?? 'a pessoa'}.`); await carregar(); } catch (e) { void avisar('Não foi possível reenviar o convite.', msg(e)); } finally { setOcupado(''); }
  }

  async function cancelar(x: EntrevistaDoProcesso) {
    const pendente = x.status === 'convidada';
    if (!(await confirmar({
      titulo: pendente ? `Cancelar o convite de ${x.entrevistado ?? 'esta pessoa'}?` : `Excluir a entrevista de ${x.entrevistado ?? 'esta pessoa'}?`,
      mensagem: pendente ? 'A pessoa não vai mais conseguir abrir esta entrevista. Dá para convidar de novo depois.' : 'A conversa, o áudio e o resultado são apagados.',
      acao: pendente ? 'Cancelar convite' : 'Excluir', perigo: true,
    }))) return;
    setOcupado(x.id);
    try { await excluirEntrevista(x.id); await carregar(); } catch (e) { void avisar('Não foi possível excluir.', msg(e)); } finally { setOcupado(''); }
  }

  const abertas = (lista ?? []).filter((x) => x.status === 'convidada' || x.status === 'em_andamento').map((x) => x.entrevistado_id).filter((x): x is string => !!x);

  return (
    <section className="secao-processo" aria-labelledby="titulo-entrevistas">
      <div className="secao-head">
        <h2 id="titulo-entrevistas"><Icone nome="microfone" tamanho={18} />Entrevistas com a Maia</h2>
        {gestor && !arquivado && <button className="btn btn-primary" onClick={() => setConvidando(true)}><Icone nome="mais" />Convidar para entrevista</button>}
      </div>
      {aviso && <p className="notice">{aviso}</p>}
      {lista === null && <p className="notice">Carregando…</p>}
      {lista?.length === 0 && (
        <p className="notice">{gestor && !arquivado
          ? 'Ninguém foi entrevistado ainda. Convide quem executa ou conhece o processo: cada pessoa conversa com a Maia por voz, no seu tempo, e o que ela contar fica registrado aqui.'
          : 'Ninguém foi entrevistado ainda.'}</p>
      )}
      {lista && lista.length > 0 && (
        <div className="lista-pops lista-entrevistas">
          {lista.map((x) => {
            const minha = souEu(eu, x.entrevistado_id);
            const pendente = x.status === 'convidada';
            const aberta = pendente || x.status === 'em_andamento';
            return (
              <article key={x.id} className="linha-pop" data-status={x.status}>
                <span className="pop-icone icone-entrevista"><Icone nome="conversa" tamanho={20} /></span>
                <div className="pop-nome">
                  <strong>{x.entrevistado ?? 'Sem entrevistado'}</strong>
                  <span>
                    {x.convidado_em ? `Convidad${x.entrevistado?.trim().endsWith('a') ? 'a' : 'o'} em ${data(x.convidado_em)}${x.convidado_por ? ` por ${x.convidado_por}` : ''}` : `Criada em ${data(x.criado_em)}`}
                    {x.falas > 0 ? ` · ${x.falas} ${x.falas === 1 ? 'fala' : 'falas'}` : ''}{x.duracao_s ? ` · ${duracao(x.duracao_s)}` : ''}
                    {x.status === 'concluida' && x.pendencias > 0 ? ` · ${x.pendencias} em aberto` : ''}
                  </span>
                </div>
                <span className={`selo-status ${CLASSE_SITUACAO[x.status] ?? ''}`}>{situacaoDaEntrevista(x)}</span>
                {gestor && pendente && <button type="button" className="btn btn-ghost" disabled={ocupado === x.id} onClick={() => void reenviar(x)} title="Manda o e-mail do convite de novo"><Icone nome="refazer" tamanho={16} />Reenviar convite</button>}
                {gestor && (pendente || x.status === 'concluida' || x.status === 'erro') && !arquivado && (
                  <button type="button" className="btn btn-ghost btn-excluir" disabled={ocupado === x.id} onClick={() => void cancelar(x)}><Icone nome="lixo" tamanho={16} />{pendente ? 'Cancelar' : 'Excluir'}</button>
                )}
                {aberta && minha
                  ? <Link className="btn btn-primary" href={`/app/entrevistas/${x.id}`}><Icone nome="microfone" tamanho={16} />{x.falas > 0 ? 'Continuar' : 'Ligar para a Maia'}</Link>
                  : <Link className={`btn ${x.tem_resultado ? 'btn-primary' : ''}`} href={`/app/entrevistas/${x.id}`}>{x.tem_resultado ? 'Ver resultado' : 'Abrir'}</Link>}
              </article>
            );
          })}
        </div>
      )}
      {convidando && (
        <Convidar processoId={processoId} processoNome={processoNome} indisponiveis={abertas} aoConvidar={convidou} aoFechar={() => setConvidando(false)} />
      )}
    </section>
  );
}
