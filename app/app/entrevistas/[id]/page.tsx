'use client';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { Fragment, Suspense, useEffect, useRef, useState } from 'react';
import { Icone } from '@/components/Icone';
import { avisar, confirmar } from '@/components/Dialogos';
import { mmss } from '@/components/entrevista/Metricas';
import { Orbe, type Niveis } from '@/components/entrevista/Orbe';
import { ehAdmin, ehGestor, souEu, useEu } from '@/lib/auth/eu';
import { ROTULO_STATUS, limparMarcasDeSom, type Etapa } from '@/lib/entrevista/topicos';
import { MotorEntrevista, RESTRICOES_MICROFONE, type Evento, type Fase } from '@/lib/entrevista/motor';
import { SeloSituacao } from '@/components/entrevista/SeloSituacao';
import { ConversaEmLigacao } from '@/components/entrevista/ConversaEmLigacao';
import { useAcompanharEntrevista } from '@/lib/entrevista/acompanhar';
import { aquecerSessaoDeVoz, confirmacaoDeExclusao, desistirComplemento, encerrarEntrevista, enviarAudioDaEntrevista, excluirEntrevista, obterEntrevista, reenviarConvite, retomarEntrevista, type Entrevista } from '@/lib/entrevistas';

// Entrevista por voz com a Maia, só com o GPT-Live (decisão 41), fora do processo. Para quem é entrevistado
// é uma ligação (decisão 52): a abertura (o que vai acontecer e o microfone), a conversa (a esfera reagindo
// às vozes; nada de texto nem de números) e o resultado (a descrição, a ficha e a conversa). Custos e
// indicadores ficam no Painel da Maia, só para administradores. O administrador tem acesso total a qualquer
// entrevista (decisão 65): vê a conversa mesmo antes de terminar e gerencia; só não fala no lugar da pessoa.

const msg = (e: unknown) => (e instanceof Error ? e.message : 'Tente de novo em instantes.');
// Durante a conversa a tela não muda de texto (a esfera mostra quem fala); só o antes e o depois têm aviso.
const AVISO_FASE: Partial<Record<Fase, { titulo: string; sub: string }>> = {
  conectando: { titulo: 'Chamando a Maia…', sub: 'Permita o uso do microfone se o navegador perguntar.' },
  encerrando: { titulo: 'Encerrando a conversa…', sub: '' },
};
const LEGENDA_CONVERSA = 'Conversa ao vivo: fale com naturalidade e interrompa a Maia quando quiser.';

function EntrevistaPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const eu = useEu();
  const [e, setE] = useState<Entrevista | null | undefined>(undefined);
  const [tela, setTela] = useState<'inicio' | 'conversa' | 'processando' | 'resultado'>('inicio');
  const [fase, setFase] = useState<Fase>('parado');
  const [segundos, setSegundos] = useState(0);
  const [aviso, setAviso] = useState('');
  const [erro, setErro] = useState<{ texto: string; repetir?: () => void } | null>(null);
  const [etapaFim, setEtapaFim] = useState('');
  const [ciente, setCiente] = useState(false);
  // O microfone é pedido quando a pessoa marca a ciência (decisão 55): a permissão do navegador, que na primeira
  // vez pode levar dezenas de segundos, sai do caminho do "Ligar para a Maia".
  const [mic, setMic] = useState<'' | 'pedindo' | 'pronto' | 'negado'>('');
  const microfone = useRef<MediaStream | null>(null);
  const motor = useRef<MotorEntrevista | null>(null);
  const encerrando = useRef(false);
  const niveis = useRef<Niveis>({ ia: 0, pessoa: 0 }); // volume das duas vozes, para a esfera (fora do estado do React)

  const carregar = () => obterEntrevista(id).then((d) => {
    setE(d);
    if (d.status !== 'em_andamento' && d.status !== 'convidada') setTela('resultado');
    else if (!d.conteudo_oculto) aquecerSessaoDeVoz(id); // enquanto a pessoa lê a abertura, a função que abre a sessão já acorda
    return d;
  }).catch(() => { setE(null); return null; });
  useEffect(() => { void carregar(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { void motor.current?.encerrar(); microfone.current?.getTracks().forEach((t) => t.stop()); }, []);

  async function marcarCiente(marcado: boolean) {
    setCiente(marcado);
    if (!marcado) { setMic(''); return; }
    if (microfone.current || !navigator.mediaDevices?.getUserMedia) return;
    setMic('pedindo');
    try {
      microfone.current = await navigator.mediaDevices.getUserMedia({ audio: RESTRICOES_MICROFONE });
      setMic('pronto');
    } catch {
      setMic('negado');
    }
  }
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
  // Quem não é a pessoa entrevistada percebe sozinho quando a ligação começa (a página passa para o aviso de
  // bloqueio) e quando termina (a entrevista abre de novo), sem recarregar (decisão 69).
  const deFora = !!e && eu !== null && !souEu(eu, e.entrevistado_id);
  useAcompanharEntrevista(id, e, deFora, () => obterEntrevista(id).then((d) => {
    setE(d);
    if (d.status !== 'em_andamento' && d.status !== 'convidada') setTela('resultado');
    else setTela((t) => (t === 'resultado' ? 'inicio' : t)); // voltou a ficar aberta (complemento): a tela da entrevista aberta
  }).catch(() => {})); // falhou: fica o que está na tela e a próxima tenta de novo

  function aoEvento(ev: Evento) {
    if (ev.tipo === 'fase') setFase(ev.fase);
    else if (ev.tipo === 'nivel') niveis.current = { ia: ev.ia, pessoa: ev.pessoa };
    else if (ev.tipo === 'aviso') setAviso(ev.texto);
    else if (ev.tipo === 'erro') setErro({ texto: ev.texto, repetir: ev.repetir });
    else if (ev.tipo === 'fim') void encerrar(false);
    else if (ev.tipo === 'pausa') void pausar();
    // 'metricas': o motor segue medindo e guardando; a tela não mostra (fica no Painel da Maia).
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
    const pronto = microfone.current; // o motor passa a cuidar do microfone (e o desliga ao encerrar)
    microfone.current = null;
    setMic('');
    try {
      await m.iniciar(pronto);
    } catch (err) {
      m.registrarErro(`Ao começar: ${msg(err)}`);
      await m.encerrar().catch(() => {});
      motor.current = null;
      setErro({ texto: `Não foi possível ligar para a Maia (${msg(err)}).`, repetir: () => void comecar() });
    }
  }

  async function encerrar(perguntar: boolean) {
    if (encerrando.current) return;
    if (perguntar && !(await confirmar({ titulo: 'Encerrar a entrevista agora?', mensagem: 'A Maia escreve a descrição e a ficha do processo com o que já foi conversado.', acao: 'Encerrar' }))) return;
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

  /** Pausa para continuar depois: desliga a ligação (nada é cobrado), guarda a conversa e o áudio, e a entrevista fica aberta. */
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
    setAviso((a) => a || 'Entrevista pausada. A ligação com a Maia foi encerrada por agora; clique em Continuar quando quiser seguir.');
    setTela('inicio');
  }

  /** Voltar para fechar pontos em aberto (decisão 56): marca os pontos; a própria pessoa vai para a tela de ligar. */
  async function retomar(pendencias: string[]) {
    setErro(null);
    const { pendencias: n } = await retomarEntrevista(id, pendencias);
    const d = await carregar();
    if (d && souEu(eu, d.entrevistado_id)) { setAviso(''); setTela('inicio'); }
    else setAviso(`Marcado: quando ${d?.entrevistado ?? 'a pessoa'} abrir a entrevista, a Maia pergunta ${n === 1 ? 'esse ponto' : `esses ${n} pontos`}.`);
  }

  async function desistir() {
    setErro(null);
    try { await desistirComplemento(id); await carregar(); setAviso(''); setTela('resultado'); } catch (err) { setErro({ texto: msg(err) }); }
  }

  async function reprocessar() {
    setErro(null);
    setE((x) => x && { ...x, status: 'processando' });
    try { await encerrarEntrevista(id); } catch (err) { setErro({ texto: `Não foi possível gerar o resultado (${msg(err)}).`, repetir: () => void reprocessar() }); }
    await carregar();
  }

  /** O administrador encerra a conversa pausada de outra pessoa e gera o resultado (decisão 65). */
  async function encerrarComoAdmin() {
    setErro(null);
    setAviso('');
    setE((x) => x && { ...x, status: 'processando' });
    setTela('resultado');
    try { await encerrarEntrevista(id); } catch (err) { setTela('inicio'); setErro({ texto: `Não foi possível encerrar a entrevista (${msg(err)}).` }); }
    await carregar();
  }

  if (e === undefined) return <div className="page"><p className="notice">Carregando…</p></div>;
  if (e === null) return <div className="page"><div className="empty"><h2>Entrevista não encontrada</h2><Link href="/app/entrevistas" className="btn btn-primary">Voltar</Link></div></div>;

  const cabecalho = (
    <div className="page-head">
      <div>
        <nav className="migalha" aria-label="Caminho">
          {e.processo
            ? <><Link href={`/app/processos/${e.processo.id}`}>{e.processo.nome}</Link><span>›</span><Link href="/app/entrevistas">Conversas com a Maia</Link></>
            : <Link href="/app/entrevistas">Conversas com a Maia</Link>}
        </nav>
        <h1>{e.tema || 'Entrevista'}</h1>
        {!e.processo && e.contexto && <p>{e.contexto}</p>}
        {e.entrevistado && <p className="page-meta">Entrevistado: <strong>{e.entrevistado}</strong>{e.convidador && e.convidado_em ? ` · convite de ${e.convidador} em ${new Date(e.convidado_em).toLocaleDateString('pt-BR')}` : ''}</p>}
      </div>
    </div>
  );

  // Enquanto a pessoa conversa com a Maia, ninguém mais entra na entrevista, nem o administrador (decisão 69).
  if (e.conteudo_oculto) {
    return (
      <div className="page page-estreita">
        {cabecalho}
        <ConversaEmLigacao entrevistado={e.entrevistado} voltar={e.processo ? { href: `/app/processos/${e.processo.id}`, rotulo: 'Voltar ao processo' } : { href: '/app/entrevistas', rotulo: 'Voltar' }} />
      </div>
    );
  }

  if (tela === 'inicio') {
    const retomando = e.turnos.length > 0;
    const minha = souEu(eu, e.entrevistado_id); // só a pessoa convidada liga para a Maia (decisão 49)
    const complemento = e.complemento && !e.complemento.concluido_em ? e.complemento : null; // voltou para fechar pontos em aberto (decisão 56)
    if (eu !== null && !minha && ehAdmin(eu)) {
      return (
        <GestaoDaEntrevista e={e} cabecalho={cabecalho} aviso={aviso} erro={erro?.texto ?? ''}
          aoMudar={async (texto) => { setErro(null); setAviso(texto); await carregar(); }}
          aoEncerrar={encerrarComoAdmin}
          aoDesistir={desistir}
          aoExcluir={() => router.push(e.processo ? `/app/processos/${e.processo.id}` : '/app/entrevistas')} />
      );
    }
    if (eu !== null && !minha) {
      return (
        <div className="page page-estreita">
          {cabecalho}
          <div className="cartao">
            <h3 className="sem-margem">Entrevista de {e.entrevistado ?? 'outra pessoa'}</h3>
            <p className="notice">Só quem foi convidado conversa com a Maia nesta entrevista. {complemento ? `Está marcado para ${e.entrevistado ?? 'a pessoa'} responder ${complemento.pendencias.length === 1 ? 'um ponto que ficou' : `${complemento.pendencias.length} pontos que ficaram`} em aberto; quando voltar, a Maia pergunta só isso e o resultado é refeito.` : retomando ? `A conversa está pausada, com ${e.turnos.length} falas; quando ${e.entrevistado ?? 'a pessoa'} terminar, o resultado aparece aqui e no processo.` : 'Quando a pessoa fizer a entrevista, o resultado aparece aqui e no processo.'}</p>
            {complemento && <ul className="ficha-lista">{complemento.pendencias.map((x, i) => <li key={i}>{x}</li>)}</ul>}
            {erro && <div className="entrevista-erro" role="alert"><span>{erro.texto}</span></div>}
            <div className="fluxo-acoes">
              <Link href={e.processo ? `/app/processos/${e.processo.id}` : '/app/entrevistas'} className="btn"><Icone nome="voltar" tamanho={16} />{e.processo ? 'Voltar ao processo' : 'Voltar'}</Link>
              {complemento && ehGestor(eu) && e.turnos.length === complemento.a_partir_do_turno && <button className="btn btn-ghost" onClick={() => void desistir()}>Deixar como está</button>}
            </div>
          </div>
        </div>
      );
    }
    return (
      <div className="page page-estreita">
        {cabecalho}
        <div className="cartao">
          <h3 className="sem-margem">{complemento ? 'Completar a entrevista' : retomando ? 'Continuar a entrevista' : 'Como funciona'}</h3>
          {complemento && (
            <>
              <p className="notice">Ficaram pontos em aberto. Nesta ligação a Maia cumprimenta você e pergunta só sobre eles; no fim, o resultado é refeito com a conversa inteira.</p>
              <ul className="ficha-lista lista-pendencias-escolhidas">{complemento.pendencias.map((x, i) => <li key={i}>{x}</li>)}</ul>
            </>
          )}
          {!complemento && <ul className="dicas">
            <li>A Maia, a entrevistadora por voz do INCFlow, faz perguntas sobre o processo e você responde falando, como numa ligação.</li>
            <li>É uma conversa ao vivo nos dois sentidos: ela continua ouvindo enquanto fala. Pode corrigir, completar ou interromper a qualquer momento.</li>
            <li>Durante a ligação nada aparece na tela: só um sinal de quem está falando.</li>
            <li>Pode pedir para ela verificar algo de conhecimento geral (o que é um sistema, uma sigla): ela consulta e responde na hora.</li>
            <li>No fim, ela escreve a descrição do processo e uma ficha com etapas, responsáveis, sistemas, regras, exceções e dificuldades, e aponta o que ficou em aberto. Nenhum processo é criado ou alterado.</li>
            <li>Dura o necessário para cobrir o processo. A Maia se despede sozinha quando não há mais lacunas; você também pode encerrar quando quiser. Se precisar sair no meio, é só dizer: ela pausa e vocês continuam depois.</li>
            <li>Use fones de ouvido se puder; sem fones, deixe o volume moderado.</li>
          </ul>}
          {e.nota_convite && !complemento && <p className="notice">Pedido de {e.convidador ?? 'quem convidou'}: “{e.nota_convite}”. A Maia já sabe disso.</p>}
          {aviso && <p className="notice">{aviso}</p>}
          {retomando && !complemento && <p className="notice">Esta entrevista está pausada, com {e.turnos.length} falas. Ao continuar, a Maia retoma de onde vocês pararam.</p>}
          <label className="check"><input type="checkbox" checked={ciente} onChange={(ev) => void marcarCiente(ev.target.checked)} />Estou ciente de que a conversa é gravada e processada por serviços de IA (OpenAI e Anthropic).</label>
          {mic === 'pedindo' && <p className="notice mic-estado">Permita o uso do microfone, para a Maia ouvir você.</p>}
          {mic === 'pronto' && <p className="notice mic-estado">Microfone pronto.</p>}
          {mic === 'negado' && <p className="notice mic-estado">O navegador não liberou o microfone. Permita o acesso (o cadeado na barra de endereço) e marque de novo, ou tente ligar mesmo assim.</p>}
          {erro && <div className="entrevista-erro" role="alert"><span>{erro.texto}</span></div>}
          <div className="fluxo-acoes">
            <Link href="/app/entrevistas" className="btn">Voltar</Link>
            {complemento && e.turnos.length === complemento.a_partir_do_turno && <button className="btn btn-ghost" onClick={() => void desistir()} title="Fica com o resultado que já existe">Deixar como está</button>}
            <button className="btn btn-primary" onClick={comecar} disabled={!ciente || eu === null || mic === 'pedindo'}><Icone nome="microfone" tamanho={16} />{complemento ? 'Voltar à ligação' : retomando ? 'Continuar a ligação' : 'Ligar para a Maia'}</button>
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
          {aviso && <p className="notice">{aviso}</p>}
          {erro && (
            <div className="entrevista-erro" role="alert">
              <span>{erro.texto}</span>
              {erro.repetir && <button className="btn" onClick={erro.repetir}>Tentar de novo</button>}
            </div>
          )}
          {!processando && (
            <div className="entrevista-acoes">
              <button className="btn" onClick={() => void pausar()} disabled={fase === 'conectando' || fase === 'encerrando'} title="Encerra a ligação por agora e guarda a conversa para continuar depois"><Icone nome="pausa" tamanho={16} />Pausar</button>
              <button className="btn btn-parar" onClick={() => encerrar(true)} disabled={fase === 'conectando' || fase === 'encerrando'}><Icone nome="parar" tamanho={16} />Encerrar entrevista</button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return <Resultado e={e} aviso={aviso} erro={erro} cabecalho={cabecalho} admin={ehAdmin(eu)} minha={souEu(eu, e.entrevistado_id)} gestor={ehGestor(eu)} aoReprocessar={reprocessar} aoRetomar={retomar} />;
}

function Resultado({ e, aviso, erro, cabecalho, admin, minha, gestor, aoReprocessar, aoRetomar }: {
  e: Entrevista; aviso: string; erro: { texto: string; repetir?: () => void } | null; cabecalho: React.ReactNode; admin: boolean; minha: boolean; gestor: boolean;
  aoReprocessar: () => Promise<void>; aoRetomar: (pendencias: string[]) => Promise<void>;
}) {
  const r = e.resultado;
  const parado = e.status === 'processando' && Date.now() - new Date(e.atualizado_em).getTime() > 3 * 60_000;
  // Voltar para fechar pontos em aberto (decisão 56): a própria pessoa escolhe e liga; gestores marcam para ela.
  const [escolhidas, setEscolhidas] = useState<string[]>([]);
  const [marcando, setMarcando] = useState(false);
  const [erroRetomar, setErroRetomar] = useState('');
  const podeEscolher = e.status === 'concluida' && (minha || gestor);
  const primeiroNome = e.entrevistado?.trim().split(/\s+/)[0] ?? 'a pessoa';
  async function retomar() {
    setMarcando(true);
    setErroRetomar('');
    try { await aoRetomar(escolhidas); } catch (err) { setErroRetomar(msg(err)); } finally { setMarcando(false); }
  }

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

      {r && (
        <>
          {r.entrevistado && (r.entrevistado.area || r.entrevistado.funcao) && (
            <div className="cartao" id="quem-foi-entrevistado">
              <h3 className="sem-margem">{minha ? 'Sobre você' : 'Quem foi entrevistado'}</h3>
              <dl className="ficha-resumo">
                {!minha && e.entrevistado && <><dt>Nome</dt><dd>{e.entrevistado}</dd></>}
                {r.entrevistado.area && <><dt>Área</dt><dd>{r.entrevistado.area}</dd></>}
                {r.entrevistado.funcao && <><dt>O que faz</dt><dd>{r.entrevistado.funcao}</dd></>}
              </dl>
            </div>
          )}
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

          {(r.pendencias_outra_pessoa?.length ?? 0) > 0 && (
            <div className="cartao" id="para-outra-pessoa">
              <h3 className="sem-margem">Para outra pessoa responder</h3>
              <p className="notice">{minha ? 'Você disse que não sabe responder: quem sabe é de outra área.' : `${primeiroNome} não soube responder: quem sabe é de outra área.`}{gestor && e.processo ? ' Na página do processo dá para convidar alguém de lá, já com estas perguntas.' : ''}</p>
              <ul className="ficha-lista">{r.pendencias_outra_pessoa!.map((x, i) => <li key={i}>{x.pergunta} <small>· quem sabe: {x.quem_sabe}</small></li>)}</ul>
              {gestor && e.processo && (
                <div className="fluxo-acoes"><Link className="btn" href={`/app/processos/${e.processo.id}#perguntas-para-outros`}><Icone nome="mais" tamanho={16} />Convidar alguém para responder</Link></div>
              )}
            </div>
          )}

          {r.pendencias.length > 0 && (
            <div className="cartao" id="em-aberto">
              <h3 className="sem-margem">Ficou em aberto</h3>
              {podeEscolher ? (
                <>
                  <p className="notice">{minha
                    ? 'Marque o que você quer responder e volte à ligação: a Maia pergunta só esses pontos e o resultado é refeito com a conversa inteira.'
                    : `Marque o que ${primeiroNome} deve responder: quando abrir a entrevista, a Maia pergunta só esses pontos e o resultado é refeito.`}</p>
                  <ul className="ficha-lista lista-pendencias">
                    {r.pendencias.map((p, i) => (
                      <li key={i}><label className="check"><input type="checkbox" checked={escolhidas.includes(p)} onChange={() => setEscolhidas((x) => (x.includes(p) ? x.filter((y) => y !== p) : [...x, p]))} />{p}</label></li>
                    ))}
                  </ul>
                  {erroRetomar && <div className="entrevista-erro" role="alert"><span>{erroRetomar}</span></div>}
                  <div className="fluxo-acoes">
                    <button className="btn btn-primary" disabled={!escolhidas.length || marcando} onClick={() => void retomar()}>
                      <Icone nome="microfone" tamanho={16} />{marcando ? 'Marcando…' : minha ? 'Voltar à ligação para responder' : `Pedir para ${primeiroNome} responder`}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <p className="notice">Perguntas para uma próxima conversa.</p>
                  <ul className="ficha-lista">{r.pendencias.map((p, i) => <li key={i}>{p}</li>)}</ul>
                </>
              )}
            </div>
          )}
        </>
      )}

      <ConversaTranscrita e={e} minha={minha} aberta={!r} />

      <div className="fluxo-acoes">
        <Link href={e.processo ? `/app/processos/${e.processo.id}` : '/app/entrevistas'} className="btn"><Icone nome="voltar" tamanho={16} />{e.processo ? 'Voltar ao processo' : 'Voltar às entrevistas'}</Link>
        {admin && <Link href={`/app/maia/${e.id}`} className="btn btn-ghost" title="Indicadores, custos e diagnóstico desta entrevista (só administradores)"><Icone nome="ia" tamanho={16} />Custos e métricas</Link>}
      </div>
    </div>
  );
}

/** A conversa em texto, com as gravações: quem não é a pessoa entrevistada lê o nome dela no lugar de "Você". */
function ConversaTranscrita({ e, minha, aberta, titulo = 'Conversa transcrita' }: { e: Entrevista; minha: boolean; aberta: boolean; titulo?: string }) {
  if (!e.turnos.length) return null;
  const quem = minha ? 'Você' : e.entrevistado?.trim().split(/\s+/)[0] ?? 'Entrevistado';
  return (
    <details className="cartao conversa-detalhes" open={aberta}>
      <summary>{titulo} ({e.turnos.length} falas)</summary>
      {e.audios.map((u, i) => <audio key={u} controls src={u} className="conversa-audio" preload="none" aria-label={`Gravação ${i + 1}`} />)}
      <div className="conversa-lida">
        {e.turnos.map((t, i) => (
          <Fragment key={i}>
            {e.complemento && i === e.complemento.a_partir_do_turno && i > 0 && (
              <p className="conversa-divisor">Continuação para fechar {e.complemento.pendencias.length === 1 ? 'um ponto que ficou' : `${e.complemento.pendencias.length} pontos que ficaram`} em aberto · {new Date(e.complemento.escolhidas_em).toLocaleDateString('pt-BR')}</p>
            )}
            <p className={`${t.quem}${t.sobreposta ? ' sobreposta' : ''}${t.apoio ? ' apoio' : ''}`}>
              {t.inicio_ms !== undefined && <span className="conversa-tempo">{mmss(t.inicio_ms / 1000)}</span>}
              <b>{t.quem === 'ia' ? 'Maia' : quem}{t.sobreposta ? ' (por cima da Maia)' : ''}:</b> {limparMarcasDeSom(t.texto)}
            </p>
          </Fragment>
        ))}
      </div>
    </details>
  );
}

const dataHora = (iso: string) => { const d = new Date(iso); return `${d.toLocaleDateString('pt-BR')} às ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`; };

/**
 * A entrevista de outra pessoa que ainda não terminou, vista pelo administrador (decisão 65): em que pé está, o
 * convite, a conversa até agora e as ações (reenviar ou cancelar o convite, encerrar e gerar o resultado, excluir).
 * Falar com a Maia continua sendo só da pessoa convidada: a conversa fica no nome dela.
 */
function GestaoDaEntrevista({ e, cabecalho, aviso, erro, aoMudar, aoEncerrar, aoDesistir, aoExcluir }: {
  e: Entrevista; cabecalho: React.ReactNode; aviso: string; erro: string;
  aoMudar: (aviso: string) => Promise<void>; aoEncerrar: () => Promise<void>; aoDesistir: () => Promise<void>; aoExcluir: () => void;
}) {
  const [ocupado, setOcupado] = useState(false);
  const nome = e.entrevistado ?? 'a pessoa convidada';
  const primeiroNome = e.entrevistado?.trim().split(/\s+/)[0] ?? 'a pessoa';
  const pendente = e.status === 'convidada';
  const falas = e.turnos.filter((t) => !t.apoio).length;
  const temFala = e.turnos.some((t) => t.quem === 'pessoa' && t.texto.trim());
  const complemento = e.complemento && !e.complemento.concluido_em ? e.complemento : null;
  const duracao_s = e.metricas?.duracao_s ?? 0;

  async function agir(fn: () => Promise<void>, falha: string) {
    setOcupado(true);
    try { await fn(); } catch (err) { void avisar(falha, msg(err)); } finally { setOcupado(false); }
  }
  const reenviar = () => agir(async () => { await reenviarConvite(e.id); await aoMudar(`Convite reenviado para ${nome}.`); }, 'Não foi possível reenviar o convite.');
  async function excluir() {
    if (!(await confirmar(confirmacaoDeExclusao({ status: e.status, falas, entrevistado: e.entrevistado })))) return;
    await agir(async () => { await excluirEntrevista(e.id); aoExcluir(); }, pendente ? 'Não foi possível cancelar o convite.' : 'Não foi possível excluir a entrevista.');
  }
  async function encerrar() {
    if (!(await confirmar({ titulo: `Encerrar a entrevista de ${nome}?`, mensagem: `A conversa termina como está, com ${falas} falas, e a Maia gera o resultado. ${primeiroNome} não continua mais esta ligação; se faltar algo, dá para pedir que responda os pontos em aberto depois.`, acao: 'Encerrar e gerar o resultado' }))) return;
    await agir(aoEncerrar, 'Não foi possível encerrar a entrevista.');
  }

  return (
    <div className="page page-estreita">
      {cabecalho}
      {aviso && <p className="notice">{aviso}</p>}
      {erro && <div className="entrevista-erro" role="alert"><span>{erro}</span></div>}
      <div className="cartao gestao-entrevista">
        <div className="gestao-topo">
          <h3 className="sem-margem">Entrevista de {nome}</h3>
          <SeloSituacao entrevista={{ status: e.status, falas, em_ligacao: e.em_ligacao, entrevistado: e.entrevistado, convite_enviado_em: e.convite_enviado_em, complemento_pendencias: complemento?.pendencias.length ?? null }} />
        </div>
        <dl className="ficha-resumo">
          {e.convidado_em && <><dt>Convite</dt><dd>{dataHora(e.convidado_em)}{e.convidador ? `, por ${e.convidador}` : ''}{e.convite_enviado_em ? ` · e-mail enviado em ${dataHora(e.convite_enviado_em)}` : ' · o e-mail não foi enviado'}</dd></>}
          {e.nota_convite && <><dt>Pedido</dt><dd>“{e.nota_convite}”</dd></>}
          <dt>Conversa</dt>
          <dd>{pendente ? `${primeiroNome} ainda não ligou para a Maia.` : `${e.iniciada_em ? `Começou em ${dataHora(e.iniciada_em)}` : 'Começou'}${falas ? ` · ${falas} falas` : ''}${duracao_s ? ` · ${duracao_s >= 60 ? `${Math.round(duracao_s / 60)} min` : `${Math.round(duracao_s)} s`}` : ''} · pausada, ainda sem resultado.`}</dd>
          {complemento && <><dt>Completar</dt><dd>Está marcado para {primeiroNome} responder {complemento.pendencias.length === 1 ? 'um ponto que ficou' : `${complemento.pendencias.length} pontos que ficaram`} em aberto.</dd></>}
        </dl>
        {complemento && <ul className="ficha-lista">{complemento.pendencias.map((x, i) => <li key={i}>{x}</li>)}</ul>}
        <p className="notice">Como administrador, você vê e gerencia esta entrevista. Só {primeiroNome} fala com a Maia nela: a conversa fica registrada no nome de quem foi convidado.</p>
        <div className="fluxo-acoes">
          <Link href={e.processo ? `/app/processos/${e.processo.id}` : '/app/entrevistas'} className="btn"><Icone nome="voltar" tamanho={16} />{e.processo ? 'Voltar ao processo' : 'Voltar'}</Link>
          {pendente && <button type="button" className="btn" disabled={ocupado} onClick={() => void reenviar()} title="Manda o e-mail do convite de novo"><Icone nome="refazer" tamanho={16} />Reenviar convite</button>}
          {complemento && e.turnos.length === complemento.a_partir_do_turno && <button type="button" className="btn btn-ghost" disabled={ocupado} onClick={() => void agir(aoDesistir, 'Não foi possível desfazer.')} title="Fica com o resultado que já existe">Deixar como está</button>}
          <button type="button" className="btn btn-ghost btn-excluir" disabled={ocupado} onClick={() => void excluir()} title={pendente ? 'Cancela o convite' : 'Exclui a entrevista inteira: conversa, áudio e resultado'}><Icone nome="lixo" tamanho={16} />{pendente ? 'Cancelar convite' : 'Excluir entrevista'}</button>
          {!pendente && temFala && <button type="button" className="btn btn-primary" disabled={ocupado} onClick={() => void encerrar()} title="Termina a conversa como está e gera a descrição e a ficha"><Icone nome="ia" tamanho={16} />Encerrar e gerar o resultado</button>}
          <Link href={`/app/maia/${e.id}`} className="btn btn-ghost" title="Indicadores, custos e diagnóstico desta entrevista (só administradores)"><Icone nome="ia" tamanho={16} />Custos e métricas</Link>
        </div>
      </div>
      <ConversaTranscrita e={e} minha={false} aberta titulo="Conversa até agora" />
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
