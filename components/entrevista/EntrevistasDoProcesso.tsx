'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Icone } from '@/components/Icone';
import { avisar, confirmar } from '@/components/Dialogos';
import { Convidar } from '@/components/entrevista/Convidar';
import { SeloSituacao } from '@/components/entrevista/SeloSituacao';
import { ehGestor, podeIniciarSemConvite, souEu, useEu } from '@/lib/auth/eu';
import { useAcompanharEntrevistas } from '@/lib/entrevista/acompanhar';
import type { Finalidade } from '@/lib/entrevista/topicos';
import { confirmacaoDeExclusao, excluirEntrevista, iniciarEntrevistaAgora, listarEntrevistasDoProcesso, notaParaOutraPessoa, pegarAvisoDeEntrevistas, perguntasParaOutrasPessoas, reenviarConvite, restaurarEntrevista, type EntrevistaDoProcesso, type ResultadoConvite } from '@/lib/entrevistas';

// A seção "Entrevistas com a Maia" da página do processo (decisão 53): quem foi convidado, em que pé está cada
// conversa e o atalho para o resultado. Gestores e administradores convidam, reenviam e cancelam convites; a pessoa
// convidada liga daqui. Enquanto a pessoa está na ligação, a linha mostra "Em andamento" e ninguém mais abre a
// conversa (decisão 69). Aqui ficam só as entrevistas ativas: arquivar é dentro da entrevista, e as arquivadas
// aparecem numa aba à parte (só para gestores e administradores), de onde dá para restaurar; excluir
// definitivamente, só dentro da entrevista arquivada (decisão 72). Quem pode (por enquanto, administradores) também
// abre daqui a própria entrevista na hora, sem convite nem e-mail (decisão 74).

const data = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
const duracao = (s: number) => (s >= 60 ? `${Math.round(s / 60)} min` : `${Math.round(s)} s`);
const msg = (e: unknown) => (e instanceof Error ? e.message : 'Tente de novo em instantes.');

export function EntrevistasDoProcesso({ processoId, processoNome, arquivado, pedidoDeConvite = 0, finalidadeDoPedido = 'processo', regrasDisponiveis = false, aoContar, aoChamarAtencao }: {
  processoId: string; processoNome: string; arquivado: boolean;
  pedidoDeConvite?: number; // muda a cada clique em "Convidar pessoa" fora daqui (o cartão da visão geral, a aba de regras): abre o diálogo
  finalidadeDoPedido?: Finalidade; // a finalidade com que o diálogo abre nesse pedido (decisão 89)
  regrasDisponiveis?: boolean; // o ambiente já tem a entrevista de regras de negócio
  aoContar?: (ativas: number) => void; // quantas entrevistas ativas há (a contagem da aba)
  aoChamarAtencao?: () => void; // há um aviso para mostrar aqui: a página traz esta aba para a frente
}) {
  const eu = useEu();
  const router = useRouter();
  const gestor = ehGestor(eu);
  const [iniciando, setIniciando] = useState(false);
  const [lista, setLista] = useState<EntrevistaDoProcesso[] | null>(null);
  const [convidando, setConvidando] = useState<false | { nota?: string; dica?: string; finalidade?: Finalidade }>(false);
  const [aviso, setAviso] = useState('');
  const [ocupado, setOcupado] = useState('');
  const [aba, setAba] = useState<'ativas' | 'arquivadas'>('ativas');

  const carregar = () => listarEntrevistasDoProcesso(processoId).then(setLista).catch(() => setLista([]));
  useEffect(() => { void carregar(); }, [processoId]); // eslint-disable-line react-hooks/exhaustive-deps
  // O aviso deixado pela tela da entrevista: "arquivada", "excluída definitivamente".
  useEffect(() => {
    const deixado = pegarAvisoDeEntrevistas(processoId);
    if (!deixado) return;
    setAviso(deixado.texto);
    aoChamarAtencao?.();
    if (deixado.aba) setAba(deixado.aba);
  }, [processoId]);
  useEffect(() => { if (pedidoDeConvite > 0) setConvidando({ finalidade: finalidadeDoPedido }); }, [pedidoDeConvite]); // eslint-disable-line react-hooks/exhaustive-deps
  const totalAtivas = lista ? lista.filter((x) => !x.arquivado_em).length : null;
  useEffect(() => { if (totalAtivas !== null) aoContar?.(totalAtivas); }, [totalAtivas]); // eslint-disable-line react-hooks/exhaustive-deps
  useAcompanharEntrevistas(lista, () => listarEntrevistasDoProcesso(processoId).then(setLista).catch(() => {})); // se falhar, fica a lista que já estava

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
    aoChamarAtencao?.();
  }

  async function reenviar(x: EntrevistaDoProcesso) {
    setOcupado(x.id);
    try { await reenviarConvite(x.id); setAviso(`Convite reenviado para ${x.entrevistado ?? 'a pessoa'}.`); await carregar(); } catch (e) { void avisar('Não foi possível reenviar o convite.', msg(e)); } finally { setOcupado(''); }
  }

  async function cancelar(x: EntrevistaDoProcesso) {
    if (!(await confirmar(confirmacaoDeExclusao(x)))) return;
    setOcupado(x.id);
    try { await excluirEntrevista(x.id); setAviso(x.convidado_em ? `Convite de ${x.entrevistado ?? 'a pessoa'} cancelado.` : `Entrevista de ${x.entrevistado ?? 'a pessoa'} cancelada.`); await carregar(); } catch (e) { void avisar('Não foi possível cancelar.', msg(e)); } finally { setOcupado(''); }
  }

  /** Entrevista imediata (decisão 74): abre a entrevista de quem está logado e leva direto para a tela de ligar. */
  async function iniciarAgora() {
    setIniciando(true);
    try { const r = await iniciarEntrevistaAgora(processoId); router.push(`/app/entrevistas/${r.id}`); } catch (e) { setIniciando(false); void avisar('Não foi possível iniciar a entrevista.', msg(e)); }
  }

  async function restaurar(x: EntrevistaDoProcesso) {
    setOcupado(x.id);
    try { await restaurarEntrevista(x.id); setAviso(`Entrevista de ${x.entrevistado ?? 'a pessoa'} restaurada: voltou para a lista de entrevistas ativas do processo.`); await carregar(); } catch (e) { void avisar('Não foi possível restaurar a entrevista.', msg(e)); } finally { setOcupado(''); }
  }

  // Só as ativas contam no processo: as arquivadas ficam na aba à parte (que só existe quando há alguma).
  const ativas = (lista ?? []).filter((x) => !x.arquivado_em);
  const arquivadas = gestor ? (lista ?? []).filter((x) => !!x.arquivado_em) : [];
  const abaAtual = arquivadas.length ? aba : 'ativas';
  const visiveis = abaAtual === 'arquivadas' ? arquivadas : ativas;
  // As perguntas para outras pessoas das conversas de regras ficam na própria entrevista: o convite daqui é o de mapeamento.
  const paraOutros = perguntasParaOutrasPessoas(ativas.filter((x) => x.status === 'concluida' && x.finalidade !== 'regras'));
  const abertas = ativas.filter((x) => (x.status === 'convidada' || x.status === 'em_andamento') && !!x.entrevistado_id).map((x) => ({ id: x.entrevistado_id!, finalidade: x.finalidade }));

  return (
    <section className="secao-processo secao-entrevistas" aria-labelledby="titulo-entrevistas">
      <div className="secao-head">
        <h2 id="titulo-entrevistas"><Icone nome="microfone" tamanho={18} />Entrevistas com a Maia</h2>
        {gestor && !arquivado && (
          <div className="secao-acoes">
            {podeIniciarSemConvite(eu) && (
              <button type="button" className="btn" disabled={iniciando} onClick={() => void iniciarAgora()} title="Você mesmo conversa com a Maia sobre este processo, agora, sem convite nem e-mail">
                <Icone nome="microfone" tamanho={16} />{iniciando ? 'Abrindo…' : 'Iniciar entrevista agora'}
              </button>
            )}
            <button className="btn btn-maia" onClick={() => setConvidando({})}><Icone nome="mais" />Convidar para entrevista</button>
          </div>
        )}
      </div>
      {arquivadas.length > 0 && (
        <div className="segmented abas-arquivo abas-entrevistas" role="tablist" aria-label="Entrevistas">
          <button type="button" role="tab" aria-selected={abaAtual === 'ativas'} onClick={() => { setAba('ativas'); setAviso(''); }}>Ativas <span className="conta-aba">{ativas.length}</span></button>
          <button type="button" role="tab" aria-selected={abaAtual === 'arquivadas'} onClick={() => { setAba('arquivadas'); setAviso(''); }}>Arquivadas <span className="conta-aba">{arquivadas.length}</span></button>
        </div>
      )}
      {aviso && (
        <div className="aviso retomar" role="status">
          <span>{aviso}</span>
          {arquivadas.length > 0 && abaAtual === 'ativas' && /arquivada/i.test(aviso) && !/restaurada/i.test(aviso) && <button type="button" className="btn" onClick={() => { setAba('arquivadas'); setAviso(''); }}>Ver arquivadas</button>}
        </div>
      )}
      {lista === null && <p className="notice">Carregando…</p>}
      {lista && ativas.length === 0 && abaAtual === 'ativas' && (
        <p className="notice">{arquivadas.length ? 'Nenhuma entrevista ativa neste processo.' : gestor && !arquivado
          ? 'Ninguém foi entrevistado ainda. Convide quem executa ou conhece o processo: cada pessoa conversa com a Maia por voz, no seu tempo, e o que ela contar fica registrado aqui.'
          : 'Ninguém foi entrevistado ainda.'}</p>
      )}
      {visiveis.length > 0 && (
        <div className="lista-pops lista-entrevistas">
          {visiveis.map((x) => {
            if (x.arquivado_em) {
              return (
                <article key={x.id} className="linha-pop arquivada" data-status={x.status} data-arquivada="sim">
                  <span className="pop-icone"><Icone nome="arquivar" tamanho={20} /></span>
                  <div className="pop-nome">
                    <strong>{x.entrevistado ?? 'Sem entrevistado'}{x.entrevistado_area ? <small className="entrevistado-area"> · {x.entrevistado_area}</small> : null}</strong>
                    <span>Arquivada em {data(x.arquivado_em)}{x.arquivado_por ? ` por ${x.arquivado_por}` : ''}{x.falas > 0 ? ` · ${x.falas} ${x.falas === 1 ? 'fala' : 'falas'}` : ''}{x.duracao_s ? ` · ${duracao(x.duracao_s)}` : ''}</span>
                  </div>
                  <SeloSituacao entrevista={x} />
                  {!arquivado && <button type="button" className="btn btn-ghost" disabled={ocupado === x.id} onClick={() => void restaurar(x)} title="Devolve a entrevista à lista de ativas do processo"><Icone nome="desfazer" tamanho={16} />Restaurar</button>}
                  <Link className="btn" href={`/app/entrevistas/${x.id}`}>Abrir</Link>
                </article>
              );
            }
            const minha = souEu(eu, x.entrevistado_id);
            const pendente = x.status === 'convidada';
            const aberta = pendente || x.status === 'em_andamento';
            const fechada = x.em_ligacao && !minha; // a pessoa está na ligação: só ela entra na conversa
            return (
              <article key={x.id} className="linha-pop" data-status={x.status} data-em-ligacao={x.em_ligacao ? 'sim' : undefined}>
                <span className="pop-icone icone-entrevista"><Icone nome="conversa" tamanho={20} /></span>
                <div className="pop-nome">
                  <strong>{x.entrevistado ?? 'Sem entrevistado'}{x.entrevistado_area ? <small className="entrevistado-area"> · {x.entrevistado_area}</small> : null}{x.finalidade === 'regras' && <span className="chip-regra chip-maia chip-finalidade">Regras de negócio</span>}</strong>
                  <span>
                    {x.convidado_em ? `Convidad${x.entrevistado?.trim().endsWith('a') ? 'a' : 'o'} em ${data(x.convidado_em)}${x.convidado_por ? ` por ${x.convidado_por}` : ''}` : `Aberta sem convite em ${data(x.criado_em)}`}
                    {x.falas > 0 ? ` · ${x.falas} ${x.falas === 1 ? 'fala' : 'falas'}` : ''}{x.duracao_s ? ` · ${duracao(x.duracao_s)}` : ''}
                    {x.status === 'concluida' && x.regras_sugeridas !== null ? ` · ${x.regras_sugeridas} ${x.regras_sugeridas === 1 ? 'regra sugerida' : 'regras sugeridas'}` : ''}
                    {x.status === 'concluida' && x.pendencias > 0 ? ` · ${x.pendencias} em aberto` : ''}
                  </span>
                </div>
                <SeloSituacao entrevista={x} />
                {gestor && pendente && x.convidado_em && <button type="button" className="btn btn-ghost" disabled={ocupado === x.id} onClick={() => void reenviar(x)} title="Manda o e-mail do convite de novo"><Icone nome="refazer" tamanho={16} />Reenviar convite</button>}
                {gestor && pendente && (
                  <button type="button" className="btn btn-ghost btn-excluir" disabled={ocupado === x.id} onClick={() => void cancelar(x)} title={x.convidado_em ? 'Cancela o convite' : 'Cancela a entrevista que ainda não começou'}><Icone nome="lixo" tamanho={16} />Cancelar</button>
                )}
                {fechada
                  ? <span className="nota-ao-vivo">Abre quando a ligação terminar</span>
                  : aberta && minha
                    ? <Link className="btn btn-primary" href={`/app/entrevistas/${x.id}`}><Icone nome="microfone" tamanho={16} />{x.falas > 0 ? 'Continuar' : 'Ligar para a Maia'}</Link>
                    : <Link className={`btn ${x.tem_resultado ? 'btn-primary' : ''}`} href={`/app/entrevistas/${x.id}`}>{x.tem_resultado ? 'Ver resultado' : 'Abrir'}</Link>}
              </article>
            );
          })}
        </div>
      )}
      {paraOutros.length > 0 && (
        <div className="cartao perguntas-outros" id="perguntas-para-outros">
          <h3 className="sem-margem">Perguntas para outras pessoas</h3>
          <p className="notice">Quem foi entrevistado não soube responder: quem sabe é de outra área. Convide alguém de lá; a Maia já recebe as perguntas no pedido do convite.</p>
          {paraOutros.map((g) => (
            <div key={g.quem_sabe} className="perguntas-grupo">
              <div className="perguntas-grupo-head">
                <strong>{g.quem_sabe}</strong>
                {gestor && !arquivado && (
                  <button className="btn" onClick={() => setConvidando({ nota: notaParaOutraPessoa(g.quem_sabe, [...new Set(g.perguntas.map((x) => x.pergunta))]), dica: `Escolha alguém de ${g.quem_sabe}.` })}>
                    <Icone nome="mais" tamanho={16} />Convidar alguém de {g.quem_sabe}
                  </button>
                )}
              </div>
              <ul className="ficha-lista">{g.perguntas.map((x, i) => <li key={i}>{x.pergunta}{x.de ? <small> · {x.de} não soube</small> : null}</li>)}</ul>
            </div>
          ))}
        </div>
      )}
      {convidando && (
        <Convidar processoId={processoId} processoNome={processoNome} indisponiveis={abertas} finalidadeInicial={convidando.finalidade} regrasDisponiveis={regrasDisponiveis} notaInicial={convidando.nota} dica={convidando.dica} aoConvidar={convidou} aoFechar={() => setConvidando(false)} />
      )}
    </section>
  );
}
