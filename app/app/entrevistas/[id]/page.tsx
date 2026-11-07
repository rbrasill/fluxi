'use client';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { Suspense, useEffect, useRef, useState } from 'react';
import { Icone } from '@/components/Icone';
import { avisar, confirmar } from '@/components/Dialogos';
import { ROTULO_STATUS, TOPICOS, transcricaoDaConversa, type Etapa } from '@/lib/entrevista/topicos';
import { MotorEntrevista, type Evento, type Fase } from '@/lib/entrevista/motor';
import { encerrarEntrevista, enviarAudioDaEntrevista, obterEntrevista, type Entrevista } from '@/lib/entrevistas';
import { gerarComIa } from '@/lib/fluxogramas';
import { atualizarProcesso } from '@/lib/processos';

// Entrevista por voz com a IA (decisão 39). Três telas: a abertura (o que vai acontecer e o microfone),
// a conversa (só o estado: a IA fala, ouve ou pensa; nada de texto) e o resultado (descrição sugerida,
// ficha do processo, pendências e a conversa transcrita), gerado quando a chamada termina.

const mmss = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
const msg = (e: unknown) => (e instanceof Error ? e.message : 'Tente de novo em instantes.');
const ESTADO: Record<Fase, { titulo: string; sub: string; icone: string }> = {
  parado: { titulo: 'Pronto', sub: '', icone: 'microfone' },
  conectando: { titulo: 'Ligando o microfone e a escuta…', sub: 'Permita o uso do microfone se o navegador perguntar.', icone: 'microfone' },
  falando: { titulo: 'A IA está falando', sub: 'Ouça a pergunta; depois é a sua vez.', icone: 'alto-falante' },
  ouvindo: { titulo: 'Pode falar, estou ouvindo', sub: 'Responda com calma; a IA espera você terminar. Se quiser, fale por cima dela: ela para e ouve.', icone: 'microfone' },
  pensando: { titulo: 'Pensando na próxima pergunta…', sub: '', icone: 'ia' },
  encerrando: { titulo: 'Encerrando a conversa…', sub: '', icone: 'parar' },
};

function EntrevistaPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [e, setE] = useState<Entrevista | null | undefined>(undefined);
  const [tela, setTela] = useState<'inicio' | 'conversa' | 'processando' | 'resultado'>('inicio');
  const [fase, setFase] = useState<Fase>('parado');
  const [perguntas, setPerguntas] = useState(0);
  const [cobertos, setCobertos] = useState<string[]>([]);
  const [aviso, setAviso] = useState('');
  const [interrompeu, setInterrompeu] = useState(false); // a pessoa falou por cima da IA nesta vez
  const [interrupcoes, setInterrupcoes] = useState(0);
  const [respostas, setRespostas] = useState<number[]>([]); // ms do fim da fala da pessoa ao início da voz da IA
  const faseAnterior = useRef<Fase>('parado');
  const [falaNaTela, setFalaNaTela] = useState('');
  const [erro, setErro] = useState<{ texto: string; repetir?: () => void } | null>(null);
  const [segundos, setSegundos] = useState(0);
  const [etapaFim, setEtapaFim] = useState('');
  const [ciente, setCiente] = useState(false);
  const motor = useRef<MotorEntrevista | null>(null);

  const carregar = () => obterEntrevista(id).then((d) => {
    setE(d);
    setPerguntas(d.turnos.filter((t) => t.quem === 'ia').length);
    setCobertos(d.cobertos);
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
    if (ev.tipo === 'fase') {
      setFase(ev.fase);
      setInterrompeu(!!ev.interrompeu);
      if (ev.fase === 'ouvindo' && ev.interrompeu && faseAnterior.current === 'falando') setInterrupcoes((n) => n + 1);
      faseAnterior.current = ev.fase;
    }
    else if (ev.tipo === 'metrica') setRespostas((r) => [...r, ev.respostaMs]);
    else if (ev.tipo === 'pergunta') { setPerguntas(ev.perguntas); setCobertos(ev.cobertos); setErro(null); }
    else if (ev.tipo === 'aviso') setAviso(ev.texto);
    else if (ev.tipo === 'fala') setFalaNaTela(ev.texto);
    else if (ev.tipo === 'erro') setErro({ texto: ev.texto, repetir: ev.repetir });
    else if (ev.tipo === 'fim') void encerrar(false);
  }

  async function comecar() {
    if (!e) return;
    setTela('conversa');
    setErro(null);
    setFalaNaTela('');
    const m = new MotorEntrevista(id, aoEvento);
    motor.current = m;
    const ultima = [...e.turnos].reverse().find((t) => t.quem === 'ia')?.texto ?? 'Olá! Vamos começar. Me conta, em linhas gerais, como funciona esse processo?';
    try {
      await m.iniciar(ultima);
    } catch (err) {
      setErro({ texto: `Não foi possível começar (${msg(err)}).`, repetir: () => { void m.encerrar(); void comecar(); } });
    }
  }

  async function encerrar(perguntar: boolean) {
    if (perguntar && !(await confirmar({ titulo: 'Encerrar a entrevista agora?', mensagem: 'A IA gera a descrição e a ficha do processo com o que já foi conversado.', acao: 'Encerrar' }))) return;
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

  if (e === undefined) return <div className="page fundo-processo"><p className="notice">Carregando…</p></div>;
  if (e === null) return <div className="page fundo-processo"><div className="empty"><h2>Entrevista não encontrada</h2><Link href="/app/processos" className="btn btn-primary">Voltar</Link></div></div>;

  const cabecalho = (
    <div className="page-head">
      <div>
        <nav className="migalha" aria-label="Caminho">
          {e.processo.organizacao && <><span>{e.processo.organizacao}</span><span>›</span></>}
          {e.processo.area && <><span>{e.processo.area}</span><span>›</span></>}
          <Link href={`/app/processos/${e.processo.id}`}>{e.processo.nome}</Link>
        </nav>
        <h1>Entrevista com IA</h1>
        <p>Processo <b>{e.processo.nome}</b> · <span className="code">{e.processo.codigo}</span></p>
      </div>
    </div>
  );

  if (tela === 'inicio') {
    const retomando = e.turnos.some((t) => t.quem === 'pessoa');
    return (
      <div className="page page-estreita fundo-processo">
        {cabecalho}
        <div className="cartao">
          <h3 className="sem-margem">{retomando ? 'Continuar a entrevista' : 'Como funciona'}</h3>
          <ul className="dicas">
            <li>A IA faz perguntas por voz sobre o processo <b>{e.processo.nome}</b> e você responde falando, como numa conversa com um consultor.</li>
            <li>Durante a conversa nada aparece na tela: só um sinal de quando a IA está falando, ouvindo ou pensando. O microfone fica aberto o tempo todo: você pode falar por cima da IA, que para e ouve.</li>
            <li>A conversa fica gravada e é transcrita. No fim, a IA escreve a descrição do processo e uma ficha com etapas, responsáveis, sistemas, regras, exceções e dificuldades, e aponta o que ficou em aberto.</li>
            <li>Dura de quinze a trinta minutos. Você pode encerrar quando quiser; o que já foi conversado é aproveitado.</li>
            <li>Use fones de ouvido e um lugar silencioso. Fale com calma: a IA espera você terminar a frase.</li>
          </ul>
          {retomando && <p className="notice">Esta entrevista já tem {e.turnos.filter((t) => t.quem === 'pessoa').length} respostas. Ao continuar, a IA repete a última pergunta.</p>}
          <label className="check"><input type="checkbox" checked={ciente} onChange={(ev) => setCiente(ev.target.checked)} />Estou ciente de que a conversa é gravada e processada por serviços de IA (AssemblyAI e Anthropic).</label>
          <div className="fluxo-acoes">
            <Link href={`/app/processos/${e.processo.id}`} className="btn">Voltar ao processo</Link>
            <button className="btn btn-primary" onClick={comecar} disabled={!ciente || e.processo.arquivado}><Icone nome="microfone" tamanho={16} />{retomando ? 'Continuar' : 'Começar a entrevista'}</button>
          </div>
        </div>
      </div>
    );
  }

  if (tela === 'conversa' || tela === 'processando') {
    const est = ESTADO[fase];
    const processando = tela === 'processando';
    return (
      <div className="page page-estreita fundo-processo">
        {cabecalho}
        <div className="cartao entrevista-vivo" data-fase={processando ? 'processando' : fase}>
          <div className={`orb ${processando ? 'pensando' : fase}`} aria-hidden="true"><Icone nome={processando ? 'ia' : est.icone} tamanho={56} /></div>
          <h2 className="entrevista-estado" aria-live="polite">{processando ? etapaFim : est.titulo}</h2>
          {!processando && (fase === 'ouvindo' && interrompeu ? <p className="entrevista-sub entrevista-interrompeu">Você interrompeu a IA: pode continuar, ela está ouvindo.</p> : est.sub && <p className="entrevista-sub">{est.sub}</p>)}
          {!processando && <p className="entrevista-sub"><b>{perguntas}</b> {perguntas === 1 ? 'pergunta' : 'perguntas'} · {mmss(segundos)}</p>}
          {!processando && respostas.length > 0 && (
            <p className="entrevista-sub entrevista-metricas" title="Do fim da sua fala ao início da voz da IA">
              Resposta da IA: {(respostas[respostas.length - 1] / 1000).toFixed(1).replace('.', ',')} s (média {(respostas.reduce((a, b) => a + b, 0) / respostas.length / 1000).toFixed(1).replace('.', ',')} s)
              {interrupcoes > 0 && ` · ${interrupcoes} ${interrupcoes === 1 ? 'interrupção' : 'interrupções'}`}
            </p>
          )}
          <div className="entrevista-topicos" title={`Tópicos cobertos: ${cobertos.length} de ${TOPICOS.length}`}>
            {TOPICOS.map((t) => <span key={t.id} className={cobertos.includes(t.id) ? 'coberto' : ''} title={`${t.nome}${cobertos.includes(t.id) ? ' · coberto' : ''}`} />)}
            <small>{cobertos.length} de {TOPICOS.length} tópicos</small>
          </div>
          {falaNaTela && <p className="entrevista-fala">{falaNaTela}</p>}
          {aviso && <p className="notice">{aviso}</p>}
          {erro && (
            <div className="entrevista-erro" role="alert">
              <span>{erro.texto}</span>
              {erro.repetir && <button className="btn" onClick={erro.repetir}>Tentar de novo</button>}
            </div>
          )}
          {!processando && (
            <div className="entrevista-acoes">
              <button className="btn" onClick={() => motor.current?.repetir()} disabled={fase !== 'ouvindo'} title="A IA repete a última pergunta"><Icone nome="refazer" tamanho={16} />Repetir a pergunta</button>
              <button className="btn btn-parar" onClick={() => encerrar(true)} disabled={fase === 'conectando' || fase === 'encerrando'}><Icone nome="parar" tamanho={16} />Encerrar entrevista</button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return <Resultado e={e} aviso={aviso} erro={erro} cabecalho={cabecalho} aoReprocessar={reprocessar} aoAtualizar={setE} router={router} />;
}

function Resultado({ e, aviso, erro, cabecalho, aoReprocessar, aoAtualizar, router }: {
  e: Entrevista; aviso: string; erro: { texto: string; repetir?: () => void } | null; cabecalho: React.ReactNode;
  aoReprocessar: () => Promise<void>; aoAtualizar: (e: Entrevista) => void; router: ReturnType<typeof useRouter>;
}) {
  const [aplicando, setAplicando] = useState(false);
  const [aplicado, setAplicado] = useState(false);
  const [gerando, setGerando] = useState(false);
  const r = e.resultado;
  const parado = e.status === 'processando' && Date.now() - new Date(e.atualizado_em).getTime() > 3 * 60_000;

  async function usarDescricao() {
    if (!r) return;
    if (!e.processo.descricao_vazia && !(await confirmar({ titulo: 'Substituir a descrição do processo?', mensagem: 'A descrição atual do processo é trocada pela sugerida na entrevista. Dá para editar depois.', acao: 'Substituir' }))) return;
    setAplicando(true);
    try {
      await atualizarProcesso(e.processo.id, { descricao: r.descricao });
      aoAtualizar({ ...e, processo: { ...e.processo, descricao_vazia: false } });
      setAplicado(true);
    } catch (err) {
      void avisar('Não foi possível aplicar a descrição.', msg(err));
    } finally {
      setAplicando(false);
    }
  }

  async function gerarFluxograma() {
    if (e.processo.tem_fluxograma && !(await confirmar({ titulo: 'Gerar outro fluxograma?', mensagem: 'O processo já tem um fluxograma. A IA desenha outro no lugar dele, a partir da entrevista.', acao: 'Gerar de novo' }))) return;
    setGerando(true);
    try {
      const f = await gerarComIa({ texto: transcricaoDaConversa(e.turnos), origem: 'transcricao', nome: e.processo.nome, processo_id: e.processo.id, substituir: e.processo.tem_fluxograma });
      router.push(`/app/fluxogramas/${f.id}`);
    } catch (err) {
      setGerando(false);
      void avisar('Não foi possível gerar o fluxograma.', msg(err));
    }
  }

  return (
    <div className="page page-estreita fundo-processo">
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
        <div className="cartao"><h3 className="sem-margem">Entrevista encerrada sem respostas</h3><p className="notice">Ninguém respondeu às perguntas, então não há o que gerar. Abra uma nova entrevista no processo.</p></div>
      )}

      {r && (
        <>
          <div className="cartao">
            <div className="sec-titulo">
              <h3 className="sem-margem">Descrição sugerida</h3>
              <div className="sec-titulo-acoes">
                {aplicado
                  ? <span className="notice">Aplicada ao processo. <Link href={`/app/processos/${e.processo.id}`}>Ver o processo</Link></span>
                  : <button className="btn btn-primary" onClick={usarDescricao} disabled={aplicando || e.processo.arquivado} title={e.processo.descricao_vazia ? 'Passa a ser a descrição do processo' : 'Substitui a descrição atual do processo'}><Icone nome="check" tamanho={16} />{aplicando ? 'Aplicando…' : 'Usar como descrição do processo'}</button>}
              </div>
            </div>
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

          <div className="cartao">
            <div className="sec-titulo">
              <div>
                <h3 className="sem-margem">Fluxograma</h3>
                <p className="notice">A IA desenha o fluxograma do processo a partir da conversa{e.processo.tem_fluxograma ? ' (no lugar do atual)' : ''}.</p>
              </div>
              <button className="btn btn-primary" onClick={gerarFluxograma} disabled={gerando || e.processo.arquivado}><Icone nome="fluxo" tamanho={16} />{gerando ? 'Gerando…' : e.processo.tem_fluxograma ? 'Gerar de novo com a entrevista' : 'Gerar fluxograma'}</button>
            </div>
          </div>
        </>
      )}

      {e.turnos.length > 0 && (
        <details className="cartao conversa-detalhes">
          <summary>Conversa transcrita ({e.turnos.filter((t) => t.quem === 'ia').length} perguntas)</summary>
          {e.audio_url && <audio controls src={e.audio_url} className="conversa-audio" preload="none" />}
          <div className="conversa-lida">
            {e.turnos.map((t, i) => <p key={i} className={t.quem}><b>{t.quem === 'ia' ? 'IA' : 'Você'}:</b> {t.texto}</p>)}
          </div>
        </details>
      )}

      <div className="fluxo-acoes"><Link href={`/app/processos/${e.processo.id}`} className="btn"><Icone nome="voltar" tamanho={16} />Voltar ao processo</Link></div>
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
