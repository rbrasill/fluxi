'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Suspense, useEffect, useRef, useState } from 'react';
import { Icone } from '@/components/Icone';
import { confirmar } from '@/components/Dialogos';
import { Orbe, type Niveis } from '@/components/entrevista/Orbe';
import { ROTULO_STATUS, resumoMetricas, type Consulta, type Etapa, type Metricas } from '@/lib/entrevista/topicos';
import { MotorEntrevista, type Evento, type Fase } from '@/lib/entrevista/motor';
import { aquecerSessaoDeVoz, encerrarEntrevista, enviarAudioDaEntrevista, obterEntrevista, type Entrevista } from '@/lib/entrevistas';

// Entrevista por voz com a IA, só com o GPT-Live (decisão 41), fora do processo. Três telas: a abertura
// (o que vai acontecer e o microfone), a conversa (a esfera da IA reagindo às vozes e o estado: a IA fala,
// ouve, ou os dois falam juntos; nada de texto) e o resultado (a informação gerada, as métricas e a conversa).

const mmss = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const seg = (ms?: number) => (ms === undefined ? '—' : `${(ms / 1000).toFixed(1).replace('.', ',')} s`);
// Centavos; abaixo de um centavo (as consultas custam frações), quatro casas.
const usd = (v: number) => `US$ ${v.toFixed(v > 0 && v < 0.01 ? 4 : 2).replace('.', ',')}`;
const msg = (e: unknown) => (e instanceof Error ? e.message : 'Tente de novo em instantes.');
// Durante a conversa a tela não muda de texto (a esfera mostra quem fala); só o antes e o depois têm aviso.
const AVISO_FASE: Partial<Record<Fase, { titulo: string; sub: string }>> = {
  conectando: { titulo: 'Ligando o microfone e a voz…', sub: 'Permita o uso do microfone se o navegador perguntar.' },
  encerrando: { titulo: 'Encerrando a conversa…', sub: '' },
};
const LEGENDA_CONVERSA = 'Conversa ao vivo: fale com naturalidade e interrompa a IA quando quiser.';

function EntrevistaPage() {
  const { id } = useParams<{ id: string }>();
  const [e, setE] = useState<Entrevista | null | undefined>(undefined);
  const [tela, setTela] = useState<'inicio' | 'conversa' | 'processando' | 'resultado'>('inicio');
  const [fase, setFase] = useState<Fase>('parado');
  const [metricas, setMetricas] = useState<Metricas>({});
  const [segundos, setSegundos] = useState(0);
  const [aviso, setAviso] = useState('');
  const [erro, setErro] = useState<{ texto: string; repetir?: () => void } | null>(null);
  const [etapaFim, setEtapaFim] = useState('');
  const [ciente, setCiente] = useState(false);
  const motor = useRef<MotorEntrevista | null>(null);
  const encerrando = useRef(false);
  const niveis = useRef<Niveis>({ ia: 0, pessoa: 0 }); // volume das duas vozes, para a esfera (fora do estado do React)

  const carregar = () => obterEntrevista(id).then((d) => {
    setE(d);
    setMetricas(d.metricas ?? {});
    if (d.status !== 'em_andamento') setTela('resultado');
    else aquecerSessaoDeVoz(id); // enquanto a pessoa lê a abertura, a função que abre a sessão já acorda
    return d;
  }).catch(() => { setE(null); return null; });
  useEffect(() => { void carregar(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { void motor.current?.encerrar(); }, []);
  useEffect(() => {
    if (tela !== 'conversa') return;
    const t = setInterval(() => setSegundos((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [tela]);
  // O resultado ainda está sendo gerado (ou a função do servidor foi interrompida): consulta de novo.
  useEffect(() => {
    if (tela !== 'resultado' || e?.status !== 'processando') return;
    const t = setTimeout(() => void carregar(), 5000);
    return () => clearTimeout(t);
  }, [tela, e]); // eslint-disable-line react-hooks/exhaustive-deps

  function aoEvento(ev: Evento) {
    if (ev.tipo === 'fase') setFase(ev.fase);
    else if (ev.tipo === 'nivel') niveis.current = { ia: ev.ia, pessoa: ev.pessoa };
    else if (ev.tipo === 'metricas') setMetricas(ev.metricas);
    else if (ev.tipo === 'aviso') setAviso(ev.texto);
    else if (ev.tipo === 'erro') setErro({ texto: ev.texto, repetir: ev.repetir });
    else if (ev.tipo === 'fim') void encerrar(false);
    else if (ev.tipo === 'pausa') void pausar();
  }

  async function comecar() {
    if (!e) return;
    setTela('conversa');
    setErro(null);
    setAviso('');
    setSegundos(Math.round(e.metricas?.duracao_s ?? 0));
    encerrando.current = false;
    const m = new MotorEntrevista(id, aoEvento, e.turnos, e.metricas ?? {}, e.frase_final, e.frase_pausa);
    motor.current = m;
    try {
      await m.iniciar();
    } catch (err) {
      m.registrarErro(`Ao começar: ${msg(err)}`);
      await m.encerrar().catch(() => {});
      motor.current = null;
      setErro({ texto: `Não foi possível começar (${msg(err)}).`, repetir: () => void comecar() });
    }
  }

  async function encerrar(perguntar: boolean) {
    if (encerrando.current) return;
    if (perguntar && !(await confirmar({ titulo: 'Encerrar a entrevista agora?', mensagem: 'A IA gera a descrição e a ficha do processo com o que já foi conversado.', acao: 'Encerrar' }))) return;
    encerrando.current = true;
    setTela('processando');
    setErro(null);
    setEtapaFim('Encerrando a conversa…');
    const m = motor.current;
    motor.current = null;
    const blob = await m?.encerrar().catch(() => null);
    const envio = blob && blob.size > 0
      ? enviarAudioDaEntrevista(id, blob).catch(() => setAviso('O áudio da conversa não pôde ser guardado; o resultado sai mesmo assim.'))
      : Promise.resolve();
    setEtapaFim('Gerando a descrição e a ficha do processo… Pode levar um minuto.');
    try { await encerrarEntrevista(id); } catch (err) { setErro({ texto: `Não foi possível gerar o resultado (${msg(err)}).`, repetir: () => void reprocessar() }); }
    await envio;
    await carregar();
    setTela('resultado');
  }

  /** Pausa para continuar depois: desliga a sessão (nada é cobrado), guarda a conversa e o áudio, e a entrevista fica aberta. */
  async function pausar() {
    if (encerrando.current) return;
    encerrando.current = true;
    setTela('processando');
    setErro(null);
    setEtapaFim('Pausando a conversa…');
    const m = motor.current;
    motor.current = null;
    m?.marcarPausa();
    const blob = await m?.encerrar().catch(() => null);
    if (blob && blob.size > 0) await enviarAudioDaEntrevista(id, blob).catch(() => setAviso('O áudio desta parte da conversa não pôde ser guardado.'));
    await carregar();
    setAviso((a) => a || 'Entrevista pausada: a ligação com a IA foi desligada e nada é cobrado enquanto ela estiver pausada. Clique em Continuar quando quiser seguir.');
    setTela('inicio');
  }

  async function reprocessar() {
    setErro(null);
    setE((x) => x && { ...x, status: 'processando' });
    try { await encerrarEntrevista(id); } catch (err) { setErro({ texto: `Não foi possível gerar o resultado (${msg(err)}).`, repetir: () => void reprocessar() }); }
    await carregar();
  }

  if (e === undefined) return <div className="page"><p className="notice">Carregando…</p></div>;
  if (e === null) return <div className="page"><div className="empty"><h2>Entrevista não encontrada</h2><Link href="/app/entrevistas" className="btn btn-primary">Voltar</Link></div></div>;

  const cabecalho = (
    <div className="page-head">
      <div>
        <nav className="migalha" aria-label="Caminho"><Link href="/app/entrevistas">Entrevista com IA</Link></nav>
        <h1>{e.tema || 'Entrevista'}</h1>
        {e.contexto && <p>{e.contexto}</p>}
      </div>
    </div>
  );
  const painelMetricas = <PainelMetricas metricas={metricas} />;

  if (tela === 'inicio') {
    const retomando = e.turnos.length > 0;
    return (
      <div className="page page-estreita">
        {cabecalho}
        <div className="cartao">
          <h3 className="sem-margem">{retomando ? 'Continuar a entrevista' : 'Como funciona'}</h3>
          <ul className="dicas">
            <li>A IA faz perguntas por voz sobre o processo e você responde falando, como numa conversa com um consultor.</li>
            <li>É uma conversa ao vivo nos dois sentidos: a IA continua ouvindo enquanto fala. Pode corrigir, completar ou interromper a qualquer momento.</li>
            <li>Durante a conversa nada aparece na tela: só um sinal de quem está falando.</li>
            <li>Pode pedir para ela verificar algo de conhecimento geral (o que é um sistema, uma sigla): ela consulta e responde na hora.</li>
            <li>No fim, a IA escreve a descrição do processo e uma ficha com etapas, responsáveis, sistemas, regras, exceções e dificuldades, e aponta o que ficou em aberto. Nenhum processo é criado ou alterado.</li>
            <li>Dura o necessário para cobrir o processo (no máximo 45 minutos). A IA se despede sozinha quando não há mais lacunas; você também pode encerrar quando quiser.</li>
            <li>Use fones de ouvido se puder; sem fones, deixe o volume moderado.</li>
          </ul>
          {aviso && <p className="notice">{aviso}</p>}
          {retomando && <p className="notice">Esta entrevista está pausada, com {e.turnos.length} falas. Ao continuar, a JOI retoma de onde vocês pararam.</p>}
          <label className="check"><input type="checkbox" checked={ciente} onChange={(ev) => setCiente(ev.target.checked)} />Estou ciente de que a conversa é gravada e processada por serviços de IA (OpenAI e Anthropic).</label>
          {erro && <div className="entrevista-erro" role="alert"><span>{erro.texto}</span></div>}
          <div className="fluxo-acoes">
            <Link href="/app/entrevistas" className="btn">Voltar</Link>
            <button className="btn btn-primary" onClick={comecar} disabled={!ciente}><Icone nome="microfone" tamanho={16} />{retomando ? 'Continuar' : 'Começar a entrevista'}</button>
          </div>
        </div>
      </div>
    );
  }

  if (tela === 'conversa' || tela === 'processando') {
    const aviso_fase = AVISO_FASE[fase];
    const processando = tela === 'processando';
    return (
      <div className="page page-estreita">
        {cabecalho}
        <div className="cartao entrevista-vivo escuro" data-fase={processando ? 'processando' : fase}>
          <Orbe modo={processando ? 'processando' : fase === 'conectando' ? 'conectando' : 'conversa'} niveis={niveis} />
          {processando
            ? <h2 className="entrevista-estado" aria-live="polite">{etapaFim}</h2>
            : aviso_fase
              ? <><h2 className="entrevista-estado">{aviso_fase.titulo}</h2>{aviso_fase.sub && <p className="entrevista-sub">{aviso_fase.sub}</p>}</>
              : <p className="entrevista-sub entrevista-legenda">{LEGENDA_CONVERSA}</p>}
          {!processando && <p className="entrevista-tempo">{mmss(segundos)}</p>}
          {!processando && painelMetricas}
          {aviso && <p className="notice">{aviso}</p>}
          {erro && (
            <div className="entrevista-erro" role="alert">
              <span>{erro.texto}</span>
              {erro.repetir && <button className="btn" onClick={erro.repetir}>Tentar de novo</button>}
            </div>
          )}
          {!processando && (
            <div className="entrevista-acoes">
              <button className="btn" onClick={() => void pausar()} disabled={fase === 'conectando' || fase === 'encerrando'} title="Desliga a ligação com a IA (sem custo) e guarda a conversa para continuar depois"><Icone nome="pausa" tamanho={16} />Pausar</button>
              <button className="btn btn-parar" onClick={() => encerrar(true)} disabled={fase === 'conectando' || fase === 'encerrando'}><Icone nome="parar" tamanho={16} />Encerrar entrevista</button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return <Resultado e={e} aviso={aviso} erro={erro} cabecalho={cabecalho} painelMetricas={painelMetricas} aoReprocessar={reprocessar} />;
}

function Resultado({ e, aviso, erro, cabecalho, painelMetricas, aoReprocessar }: {
  e: Entrevista; aviso: string; erro: { texto: string; repetir?: () => void } | null; cabecalho: React.ReactNode; painelMetricas: React.ReactNode; aoReprocessar: () => Promise<void>;
}) {
  const r = e.resultado;
  const parado = e.status === 'processando' && Date.now() - new Date(e.atualizado_em).getTime() > 3 * 60_000;
  const diagnostico = e.metricas?.erros?.length || e.metricas?.desconhecidos?.length;

  return (
    <div className="page page-estreita">
      {cabecalho}
      {aviso && <p className="notice">{aviso}</p>}
      {erro && <div className="entrevista-erro" role="alert"><span>{erro.texto}</span>{erro.repetir && <button className="btn" onClick={erro.repetir}>Tentar de novo</button>}</div>}

      {e.status === 'processando' && !parado && (
        <div className="cartao entrevista-vivo escuro"><Orbe modo="processando" /><h2 className="entrevista-estado">Gerando a descrição e a ficha do processo…</h2><p className="entrevista-sub">Pode levar um minuto. A página atualiza sozinha.</p></div>
      )}
      {(e.status === 'erro' || parado) && (
        <div className="cartao">
          <h3 className="sem-margem">{ROTULO_STATUS.erro}</h3>
          <p className="notice">{e.erro || 'O processamento foi interrompido.'} A conversa está guardada: dá para gerar o resultado de novo.</p>
          <div className="fluxo-acoes"><button className="btn btn-primary" onClick={() => void aoReprocessar()}><Icone nome="ia" tamanho={16} />Gerar o resultado de novo</button></div>
        </div>
      )}
      {e.status === 'concluida' && !r && (
        <div className="cartao"><h3 className="sem-margem">Entrevista encerrada sem respostas</h3><p className="notice">Nada do que você falou chegou a ser transcrito, então não há o que gerar. Abra uma nova entrevista.</p></div>
      )}

      <div className="cartao">
        <h3 className="sem-margem">Como foi a conversa</h3>
        {painelMetricas}
        <DetalhesMetricas m={e.metricas ?? {}} />
        {e.metricas?.consultas?.length ? <Consultas lista={e.metricas.consultas} /> : null}
        {diagnostico ? (
          <details className="diagnostico"><summary>Diagnóstico da sessão de voz</summary>
            {e.metricas.erros?.length ? <><span className="ficha-rotulo">Erros</span><ul className="ficha-lista">{e.metricas.erros.map((x, i) => <li key={i}>{x}</li>)}</ul></> : null}
            {e.metricas.desconhecidos?.length ? <><span className="ficha-rotulo">Eventos não tratados</span><p className="notice">{e.metricas.desconhecidos.join(', ')}</p></> : null}
          </details>
        ) : null}
      </div>

      {r && (
        <>
          <div className="cartao">
            <h3 className="sem-margem">Descrição do processo</h3>
            <div className="descricao-sugerida" dangerouslySetInnerHTML={{ __html: r.descricao }} />
          </div>

          <div className="cartao">
            <h3 className="sem-margem">Ficha do processo</h3>
            <dl className="ficha-resumo">
              <dt>Objetivo</dt><dd>{r.ficha.objetivo || '—'}</dd>
              <dt>Início</dt><dd>{r.ficha.gatilho || '—'}</dd>
              <dt>Resultado</dt><dd>{r.ficha.resultado || '—'}</dd>
            </dl>
            {r.ficha.etapas.length > 0 && (
              <ol className="ficha-etapas">
                {r.ficha.etapas.map((et, i) => <li key={i}><FichaEtapa etapa={et} /></li>)}
              </ol>
            )}
            {r.ficha.dificuldades.length > 0 && (
              <div><span className="ficha-rotulo">Dificuldades relatadas</span><ul className="ficha-lista">{r.ficha.dificuldades.map((d, i) => <li key={i}>{d}</li>)}</ul></div>
            )}
          </div>

          {r.pendencias.length > 0 && (
            <div className="cartao">
              <h3 className="sem-margem">Ficou em aberto</h3>
              <p className="notice">Perguntas para uma próxima conversa.</p>
              <ul className="ficha-lista">{r.pendencias.map((p, i) => <li key={i}>{p}</li>)}</ul>
            </div>
          )}
        </>
      )}

      {e.turnos.length > 0 && (
        <details className="cartao conversa-detalhes" open={!r}>
          <summary>Conversa transcrita ({e.turnos.length} falas)</summary>
          {e.audios.map((u, i) => <audio key={u} controls src={u} className="conversa-audio" preload="none" aria-label={`Gravação ${i + 1}`} />)}
          <div className="conversa-lida">
            {e.turnos.map((t, i) => (
              <p key={i} className={`${t.quem}${t.sobreposta ? ' sobreposta' : ''}${t.apoio ? ' apoio' : ''}`}>
                {t.inicio_ms !== undefined && <span className="conversa-tempo">{mmss(t.inicio_ms / 1000)}</span>}
                <b>{t.quem === 'ia' ? 'IA' : 'Você'}{t.sobreposta ? ' (por cima da IA)' : ''}:</b> {t.texto}
              </p>
            ))}
          </div>
        </details>
      )}

      <div className="fluxo-acoes"><Link href="/app/entrevistas" className="btn"><Icone nome="voltar" tamanho={16} />Voltar às entrevistas</Link></div>
    </div>
  );
}

/** Indicadores e custos da entrevista (os da especificação do Rafael e os de custo), ao vivo e no resultado. */
function PainelMetricas({ metricas }: { metricas: Metricas }) {
  const r = resumoMetricas(metricas);
  const pct = (x?: number) => (x === undefined ? '—' : `${Math.round(x * 100)}%`);
  return (
    <dl className="metricas-entrevista">
      <div><dt>Reação da IA</dt><dd title="Do fim da sua fala ao início da resposta da IA: mediana (e a maior)">{seg(r.reacao_mediana_ms)}{r.reacao_max_ms !== undefined && <small>máx. {seg(r.reacao_max_ms)}</small>}</dd></div>
      <div><dt>Falas por cima da IA</dt><dd title="Vezes em que você falou enquanto a IA falava (ou numa pausa curta dela)">{r.sobreposicoes} de {r.falas_pessoa}<small>{r.falas_ia} respostas da IA</small></dd></div>
      <div><dt>Tempo de fala</dt><dd title="Quanto do tempo falado foi seu e quanto foi da IA">{pct(r.participacao_pessoa)} você<small>{mmss(metricas.tempo_pessoa_s ?? 0)} você · {mmss(metricas.tempo_ia_s ?? 0)} IA</small></dd></div>
      <div><dt>Sinais de escuta</dt><dd title='"aham", "sei", "uhum" da IA enquanto você explicava'>{r.apoios}<small>maior silêncio {seg(r.silencio_max_ms)}</small></dd></div>
      <div><dt>Consultas da IA</dt><dd title='Vezes em que a IA foi verificar algo ("deixa eu ver aqui"): quanto você esperou pela resposta (mediana) e o custo'>{r.consultas}{r.consultas > 0 && <small>{seg(r.consulta_mediana_ms)} · {usd(r.custo_consultas_usd)}</small>}</dd></div>
      <div><dt>Custo da voz</dt><dd title="GPT-Live: US$ 0,05 por minuto de sessão, cobrado por segundo">{usd(r.custo_voz_usd)}<small>{mmss(metricas.duracao_s ?? 0)} · {metricas.sessoes ?? 1} {(metricas.sessoes ?? 1) === 1 ? 'sessão' : 'sessões'}</small></dd></div>
      <div><dt>Custo da análise</dt><dd title="Claude, no fim: a descrição, a ficha e as pendências">{metricas.analise ? usd(r.custo_analise_usd) : '—'}{metricas.analise && <small>{(metricas.analise.entrada_tokens / 1000).toFixed(1).replace('.', ',')}k + {(metricas.analise.saida_tokens / 1000).toFixed(1).replace('.', ',')}k tokens</small>}</dd></div>
      <div><dt>Custo total</dt><dd title="Voz + consultas + análise">{usd(r.custo_total_usd)}</dd></div>
    </dl>
  );
}

function DetalhesMetricas({ m }: { m: Metricas }) {
  const a = m.analise;
  const c = m.conexao_etapas;
  const sinais = Object.entries(m.apoios_por_sinal ?? {}).sort((x, y) => y[1] - x[1]);
  const sessoes = m.sessoes ?? 1;
  const fechadas = m.eventos?.['session.closed'];
  return (
    <p className="notice">
      {a ? `Análise com ${a.modelo}: ${a.entrada_tokens.toLocaleString('pt-BR')} tokens de entrada, ${a.saida_tokens.toLocaleString('pt-BR')} de saída${a.demora_ms ? `, em ${Math.round(a.demora_ms / 1000)} s` : ''}. ` : ''}
      {sessoes > 1 ? `A conversa teve ${sessoes} sessões de voz${m.pausas ? ` (${m.pausas} ${m.pausas === 1 ? 'pausa' : 'pausas'})` : ''}. ` : ''}
      {fechadas !== undefined ? `Sessões desligadas com confirmação da OpenAI: ${fechadas} de ${sessoes}. ` : ''}
      {m.conexao_ms !== undefined ? `Abertura${sessoes > 1 ? ' (última sessão)' : ''}: a voz conectou ${seg(m.conexao_ms)} depois do clique${c ? ` (microfone ${seg(c.microfone_ms)}, conexão ${seg(c.oferta_ms)}, servidor ${seg(c.servidor_ms)}${c.openai_ms !== undefined ? `, dos quais OpenAI ${seg(c.openai_ms)}` : ''}, início da sessão ${seg(c.inicio_ms)})` : ''}${m.abertura_ms !== undefined ? ` e a IA começou a falar ${seg(m.abertura_ms)} depois` : ''}. ` : ''}
      {sinais.length ? `Sinais de escuta: ${sinais.map(([k, n]) => `"${k}" ${n}`).join(', ')}. ` : ''}
      Reação: do fim da sua fala ao início da resposta da IA, sem contar os sinais de escuta. Custos pelas tabelas da OpenAI (US$ 0,05/min) e da Anthropic.
    </p>
  );
}

/** O que a IA foi verificar durante a conversa, a resposta que ela recebeu e quanto a pessoa esperou. */
function Consultas({ lista }: { lista: Consulta[] }) {
  return (
    <details className="diagnostico"><summary>Consultas da IA durante a conversa ({lista.length})</summary>
      <ul className="ficha-lista">
        {lista.map((c, i) => (
          <li key={i}>{c.falhou ? <><strong>Não deu certo:</strong> {c.resposta}</> : <><strong>{c.pergunta}</strong> {c.resposta}</>} <small>({seg(c.demora_ms)}{c.falhou ? '' : ` · ${usd(c.custo_usd)}`})</small></li>
        ))}
      </ul>
    </details>
  );
}

function FichaEtapa({ etapa }: { etapa: Etapa }) {
  const listas: [string, string[]][] = [['Ferramentas', etapa.ferramentas], ['Entradas', etapa.entradas], ['Saídas', etapa.saidas], ['Regras', etapa.regras], ['Exceções', etapa.excecoes]];
  return (
    <div className="ficha-etapa">
      <h4>{etapa.nome}{etapa.responsavel && <span className="ficha-resp"> · {etapa.responsavel}</span>}</h4>
      {etapa.descricao && <p>{etapa.descricao}</p>}
      {listas.filter(([, v]) => v.length).map(([rotulo, v]) => (
        <div key={rotulo}><span className="ficha-rotulo">{rotulo}</span><ul className="ficha-lista">{v.map((x, i) => <li key={i}>{x}</li>)}</ul></div>
      ))}
    </div>
  );
}

export default function Pagina() {
  return <Suspense><EntrevistaPage /></Suspense>;
}
