'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Suspense, useEffect, useRef, useState } from 'react';
import { Icone } from '@/components/Icone';
import { confirmar } from '@/components/Dialogos';
import { ROTULO_STATUS, resumoMetricas, type Etapa, type Metricas } from '@/lib/entrevista/topicos';
import { MotorEntrevista, type Evento, type Fase } from '@/lib/entrevista/motor';
import { encerrarEntrevista, enviarAudioDaEntrevista, obterEntrevista, type Entrevista } from '@/lib/entrevistas';

// Entrevista por voz com a IA, só com o GPT-Live (decisão 41), fora do processo. Três telas: a abertura
// (o que vai acontecer e o microfone), a conversa (só o estado: a IA fala, ouve, ou os dois falam juntos;
// nada de texto) e o resultado (a informação gerada, as métricas e a conversa transcrita).

const mmss = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const seg = (ms?: number) => (ms === undefined ? '—' : `${(ms / 1000).toFixed(1).replace('.', ',')} s`);
const usd = (v: number) => `US$ ${v.toFixed(2).replace('.', ',')}`;
const msg = (e: unknown) => (e instanceof Error ? e.message : 'Tente de novo em instantes.');
const ESTADO: Record<Fase, { titulo: string; sub: string; icone: string }> = {
  parado: { titulo: 'Pronto', sub: '', icone: 'microfone' },
  conectando: { titulo: 'Ligando o microfone e a voz…', sub: 'Permita o uso do microfone se o navegador perguntar.', icone: 'microfone' },
  falando: { titulo: 'A IA está falando', sub: 'Pode falar por cima a qualquer momento: ela continua ouvindo.', icone: 'alto-falante' },
  ouvindo: { titulo: 'Pode falar, estou ouvindo', sub: 'Responda com calma; a IA espera você terminar.', icone: 'microfone' },
  juntos: { titulo: 'Vocês dois estão falando', sub: 'A IA ouve o que você diz enquanto fala.', icone: 'conversa' },
  encerrando: { titulo: 'Encerrando a conversa…', sub: '', icone: 'parar' },
};

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

  const carregar = () => obterEntrevista(id).then((d) => {
    setE(d);
    setMetricas(d.metricas ?? {});
    if (d.status !== 'em_andamento') setTela('resultado');
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
    else if (ev.tipo === 'metricas') setMetricas(ev.metricas);
    else if (ev.tipo === 'aviso') setAviso(ev.texto);
    else if (ev.tipo === 'erro') setErro({ texto: ev.texto, repetir: ev.repetir });
    else if (ev.tipo === 'fim') void encerrar(false);
  }

  async function comecar() {
    if (!e) return;
    setTela('conversa');
    setErro(null);
    setSegundos(Math.round(e.metricas?.duracao_s ?? 0));
    encerrando.current = false;
    const m = new MotorEntrevista(id, aoEvento, e.turnos, e.metricas ?? {}, e.frase_final);
    motor.current = m;
    try {
      await m.iniciar();
    } catch (err) {
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
  const r = resumoMetricas(metricas);
  const painelMetricas = (
    <dl className="metricas-entrevista">
      <div><dt>Reação da IA</dt><dd title="Do fim da sua fala ao início da fala da IA (mediana)">{seg(r.reacao_mediana_ms)}</dd></div>
      <div><dt>Falas sobrepostas</dt><dd title="Vezes em que você falou enquanto a IA falava">{r.sobreposicoes} de {r.falas_pessoa}</dd></div>
      <div><dt>Duração</dt><dd>{mmss(metricas.duracao_s ?? 0)}</dd></div>
      <div><dt>Custo da voz</dt><dd title="US$ 0,05 por minuto de sessão do GPT-Live (a análise no fim é à parte)">{usd(r.custo_voz_usd)}</dd></div>
    </dl>
  );

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
            <li>No fim, a IA escreve a descrição do processo e uma ficha com etapas, responsáveis, sistemas, regras, exceções e dificuldades, e aponta o que ficou em aberto. Nenhum processo é criado ou alterado.</li>
            <li>Dura de quinze a trinta minutos (no máximo 45). A IA se despede sozinha; você também pode encerrar quando quiser.</li>
            <li>Use fones de ouvido se puder; sem fones, deixe o volume moderado.</li>
          </ul>
          {retomando && <p className="notice">Esta entrevista já tem {e.turnos.length} falas. Ao continuar, a IA retoma de onde parou.</p>}
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
    const est = ESTADO[fase];
    const processando = tela === 'processando';
    return (
      <div className="page page-estreita">
        {cabecalho}
        <div className="cartao entrevista-vivo" data-fase={processando ? 'processando' : fase}>
          <div className={`orb ${processando ? 'pensando' : fase}`} aria-hidden="true"><Icone nome={processando ? 'ia' : est.icone} tamanho={56} /></div>
          <h2 className="entrevista-estado" aria-live="polite">{processando ? etapaFim : est.titulo}</h2>
          {!processando && est.sub && <p className="entrevista-sub">{est.sub}</p>}
          {!processando && <p className="entrevista-sub">{mmss(segundos)}</p>}
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
        <div className="cartao entrevista-vivo"><div className="orb pensando" aria-hidden="true"><Icone nome="ia" tamanho={56} /></div><h2 className="entrevista-estado">Gerando a descrição e a ficha do processo…</h2><p className="entrevista-sub">Pode levar um minuto. A página atualiza sozinha.</p></div>
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
              <p key={i} className={`${t.quem}${t.sobreposta ? ' sobreposta' : ''}`}>
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
