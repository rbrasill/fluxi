'use client';
import Image from 'next/image';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { Fragment, Suspense, useEffect, useRef, useState } from 'react';
import { corDoAvatar, iniciais } from '@/lib/iniciais';
import { Icone } from '@/components/Icone';
import { avisar, confirmar } from '@/components/Dialogos';
import { mmss } from '@/components/entrevista/Metricas';
import { Orbe, type Niveis } from '@/components/entrevista/Orbe';
import { ehAdmin, ehGestor, souEu, useEu } from '@/lib/auth/eu';
import { ROTULO_STATUS, limparMarcasDeSom, type Etapa, type Turno } from '@/lib/entrevista/topicos';
import { MotorEntrevista, RESTRICOES_MICROFONE, type Evento, type Fase } from '@/lib/entrevista/motor';
import { SeloSituacao } from '@/components/entrevista/SeloSituacao';
import { FaixaArquivado } from '@/components/FaixaArquivado';
import { ConversaEmLigacao } from '@/components/entrevista/ConversaEmLigacao';
import { useAcompanharEntrevista } from '@/lib/entrevista/acompanhar';
import { aquecerSessaoDeVoz, arquivarEntrevista, confirmacaoDeArquivamento, confirmacaoDeExclusao, deixarAvisoDeEntrevistas, desistirComplemento, encerrarEntrevista, enviarAudioDaEntrevista, excluirEntrevista, obterEntrevista, pegarAvisoDeEntrevistas, reenviarConvite, restaurarEntrevista, retomarEntrevista, type Entrevista } from '@/lib/entrevistas';

// Entrevista por voz com a Maia, só com o GPT-Live (decisão 41), fora do processo. Para quem é entrevistado
// é uma ligação (decisão 52): a abertura (o que vai acontecer e o microfone), a conversa (a esfera vibrando com
// a voz da Maia, o que ela está fazendo e a transcrição ao vivo; decisão 86) e o resultado (a descrição, a ficha
// e a conversa). Custos e
// indicadores ficam no Painel da Maia, só para administradores. O administrador tem acesso total a qualquer
// entrevista (decisão 65): vê a conversa mesmo antes de terminar e gerencia; só não fala no lugar da pessoa.

const msg = (e: unknown) => (e instanceof Error ? e.message : 'Tente de novo em instantes.');
// O que a Maia está fazendo, na tela da ligação (decisão 86).
const ESTADO_DA_LIGACAO: Partial<Record<Fase, string>> = { conectando: 'Chamando a Maia…', falando: 'Maia está falando', ouvindo: 'Maia está ouvindo', juntos: 'Maia está ouvindo', encerrando: 'Encerrando a conversa…' };
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
  const [ocupadoArquivo, setOcupadoArquivo] = useState(false); // arquivando, restaurando ou excluindo (decisão 72)
  // O microfone é pedido quando a pessoa marca a ciência (decisão 55): a permissão do navegador, que na primeira
  // vez pode levar dezenas de segundos, sai do caminho do "Ligar para a Maia".
  const [mic, setMic] = useState<'' | 'pedindo' | 'pronto' | 'negado'>('');
  const microfone = useRef<MediaStream | null>(null);
  const motor = useRef<MotorEntrevista | null>(null);
  const encerrando = useRef(false);
  const [falasVivo, setFalasVivo] = useState<Turno[]>([]); // a transcrição ao vivo da ligação (decisão 86)
  const [mudo, setMudo] = useState(false);
  const fimDasFalas = useRef<HTMLDivElement>(null);
  const niveis = useRef<Niveis>({ ia: 0, pessoa: 0 }); // volume das duas vozes, para a esfera (fora do estado do React)

  const carregar = () => obterEntrevista(id).then((d) => {
    setE(d);
    if (d.status !== 'em_andamento' && d.status !== 'convidada') setTela('resultado');
    else if (!d.conteudo_oculto && !d.arquivado_em) aquecerSessaoDeVoz(id); // enquanto a pessoa lê a abertura, a função que abre a sessão já acorda
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
  // A transcrição ao vivo: a tela lê do motor, algumas vezes por segundo, o que já foi dito.
  useEffect(() => {
    if (tela !== 'conversa') return;
    const ler = () => { const m = motor.current; if (m) setFalasVivo((antes) => { const agora = m.turnosAtuais(); return JSON.stringify(agora) === JSON.stringify(antes) ? antes : agora; }); };
    ler();
    const t = setInterval(ler, 600);
    return () => clearInterval(t);
  }, [tela]);
  // A fala nova fica sempre à vista: a lista rola sozinha para o fim.
  useEffect(() => { const el = fimDasFalas.current; if (el) el.scrollTop = el.scrollHeight; }, [falasVivo]);
  function alternarMicrofone() {
    const novo = !mudo;
    setMudo(novo);
    motor.current?.silenciarMicrofone(novo);
  }
  // O resultado ainda está sendo gerado (ou a função do servidor foi interrompida): consulta de novo.
  useEffect(() => {
    if (tela !== 'resultado' || e?.status !== 'processando') return;
    const t = setTimeout(() => void carregar(), 5000);
    return () => clearTimeout(t);
  }, [tela, e]); // eslint-disable-line react-hooks/exhaustive-deps
  // Quem não é a pessoa entrevistada percebe sozinho quando a ligação começa (a página passa para o aviso de
  // bloqueio) e quando termina (a entrevista abre de novo), sem recarregar (decisão 69).
  const deFora = !!e && eu !== null && !souEu(eu, e.entrevistado_id) && !e.arquivado_em;
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
    setMudo(false);
    setFalasVivo(e.turnos);
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

  /** Arquivar (decisão 72): gestores e administradores tiram a entrevista do fluxo do processo. Nada é apagado. */
  async function arquivar() {
    if (!e || !(await confirmar(confirmacaoDeArquivamento({ status: e.status, entrevistado: e.entrevistado })))) return;
    setOcupadoArquivo(true);
    setErro(null);
    setAviso('');
    try {
      await arquivarEntrevista(id);
      if (e.processo) deixarAvisoDeEntrevistas(e.processo.id, { texto: `Entrevista de ${e.entrevistado ?? 'a pessoa'} arquivada. Ela saiu da lista do processo e está em Arquivadas.` });
      await carregar();
    } catch (err) { void avisar('Não foi possível arquivar a entrevista.', msg(err)); } finally { setOcupadoArquivo(false); }
  }

  /** Devolve a entrevista arquivada à lista de ativas do processo. */
  async function restaurarArquivada() {
    setOcupadoArquivo(true);
    try {
      await restaurarEntrevista(id);
      if (e?.processo) pegarAvisoDeEntrevistas(e.processo.id); // o aviso de "arquivada" deixado para o processo não vale mais
      await carregar();
      setAviso('Entrevista restaurada: voltou para a lista de entrevistas ativas do processo.');
    } catch (err) { void avisar('Não foi possível restaurar a entrevista.', msg(err)); } finally { setOcupadoArquivo(false); }
  }

  /** Excluir definitivamente: só a entrevista arquivada, só o administrador, e só daqui de dentro. */
  async function excluirArquivada() {
    if (!e || !(await confirmar(confirmacaoDeExclusao({ status: e.status, falas: e.turnos.length, entrevistado: e.entrevistado })))) return;
    setOcupadoArquivo(true);
    try {
      await excluirEntrevista(id);
      if (e.processo) deixarAvisoDeEntrevistas(e.processo.id, { texto: `Entrevista de ${e.entrevistado ?? 'a pessoa'} excluída definitivamente.`, aba: 'arquivadas' });
      router.push(e.processo ? `/app/processos/${e.processo.id}` : '/app/entrevistas');
    } catch (err) { setOcupadoArquivo(false); void avisar('Não foi possível excluir a entrevista.', msg(err)); }
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

  const arquivada = !!e.arquivado_em;
  // Arquivar fica aqui dentro, no alto da entrevista (decisão 72): fora da ligação e com a entrevista já começada.
  const podeArquivar = ehGestor(eu) && !arquivada && !e.conteudo_oculto && !e.em_ligacao && e.status !== 'convidada' && e.status !== 'processando' && (tela === 'inicio' || tela === 'resultado');
  const cabecalho = (
    <>
    <nav className="trilha" aria-label="Caminho">
      {e.processo && <><Link href={`/app/processos/${e.processo.id}#entrevistas`}>{e.processo.nome}</Link><Icone nome="avancar" tamanho={14} /></>}
      <Link href="/app/entrevistas">Conversas com a Maia</Link><Icone nome="avancar" tamanho={14} />
      <span aria-current="page">{e.tema || 'Entrevista'}</span>
    </nav>
    <div className="page-head proc-cabecalho entrevista-cabecalho">
      <span className="proc-avatar avatar-maia" aria-hidden="true"><span /></span>
      <div className="proc-titulo">
        <h1>{e.tema || 'Entrevista'}{e.status === 'concluida' && !arquivada && <span className="selo-status selo-concluida">Entrevista concluída</span>}</h1>
        {!e.processo && e.contexto && <p>{e.contexto}</p>}
        {e.entrevistado && <p className="page-meta">Entrevista com <strong>{e.entrevistado}</strong>{e.convidador && e.convidado_em ? ` · convite de ${e.convidador} em ${new Date(e.convidado_em).toLocaleDateString('pt-BR')}` : ''}</p>}
      </div>
      {podeArquivar && (
        <div className="actions">
          <button type="button" className="btn" disabled={ocupadoArquivo} onClick={() => void arquivar()} title="Tira a entrevista do processo. A conversa e o resultado ficam guardados, e dá para restaurar depois"><Icone nome="arquivar" tamanho={16} />Arquivar</button>
        </div>
      )}
    </div>
    {arquivada && !e.conteudo_oculto && (
      <FaixaArquivado tipo="entrevista" desde={e.arquivado_em!} por={e.arquivador} aoRestaurar={() => void restaurarArquivada()} aoExcluir={ehAdmin(eu) ? () => void excluirArquivada() : undefined} ocupado={ocupadoArquivo} />
    )}
    </>
  );

  // A entrevista arquivada fica só com gestores e administradores (decisão 72): para os outros, inclusive a pessoa
  // entrevistada, ela saiu do processo.
  if (arquivada && e.conteudo_oculto) {
    return (
      <div className="page page-estreita">
        {cabecalho}
        <div className="cartao" id="conversa-arquivada">
          <h3 className="sem-margem">Esta conversa foi arquivada</h3>
          <p className="notice">Ela saiu da lista do processo em {new Date(e.arquivado_em!).toLocaleDateString('pt-BR')} e não pode ser continuada. Se precisar dela, fale com quem cuida do processo.</p>
          <div className="fluxo-acoes"><Link href="/app/entrevistas" className="btn"><Icone nome="voltar" tamanho={16} />Voltar</Link></div>
        </div>
      </div>
    );
  }

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
    const minha = souEu(eu, e.entrevistado_id) && !arquivada; // só a pessoa convidada liga para a Maia (decisão 49); arquivada, ninguém liga (decisão 72)
    const complemento = e.complemento && !e.complemento.concluido_em ? e.complemento : null; // voltou para fechar pontos em aberto (decisão 56)
    if (eu !== null && !minha && ehAdmin(eu)) {
      return (
        <GestaoDaEntrevista e={e} cabecalho={cabecalho} aviso={aviso} erro={erro?.texto ?? ''} arquivada={arquivada}
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
            <p className="notice">{arquivada ? 'Arquivada, esta entrevista não pode ser continuada. ' : 'Só quem foi convidado conversa com a Maia nesta entrevista. '}{complemento ? `Está marcado para ${e.entrevistado ?? 'a pessoa'} responder ${complemento.pendencias.length === 1 ? 'um ponto que ficou' : `${complemento.pendencias.length} pontos que ficaram`} em aberto; quando voltar, a Maia pergunta só isso e o resultado é refeito.` : retomando ? `A conversa está pausada, com ${e.turnos.length} falas; quando ${e.entrevistado ?? 'a pessoa'} terminar, o resultado aparece aqui e no processo.` : 'Quando a pessoa fizer a entrevista, o resultado aparece aqui e no processo.'}</p>
            {complemento && <ul className="ficha-lista">{complemento.pendencias.map((x, i) => <li key={i}>{x}</li>)}</ul>}
            {erro && <div className="entrevista-erro" role="alert"><span>{erro.texto}</span></div>}
            <div className="fluxo-acoes">
              <Link href={e.processo ? `/app/processos/${e.processo.id}` : '/app/entrevistas'} className="btn"><Icone nome="voltar" tamanho={16} />{e.processo ? 'Voltar ao processo' : 'Voltar'}</Link>
              {complemento && !arquivada && ehGestor(eu) && e.turnos.length === complemento.a_partir_do_turno && <button className="btn btn-ghost" onClick={() => void desistir()}>Deixar como está</button>}
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
    const processando = tela === 'processando';
    const estado = processando ? etapaFim : ESTADO_DA_LIGACAO[fase] ?? 'Maia está ouvindo';
    const travado = fase === 'conectando' || fase === 'encerrando';
    const falas = falasVivo.filter((t) => !t.apoio && t.texto.trim());
    return (
      <div className="ligacao">
        <header className="ligacao-topo">
          <Image src="/logo-incflow-marca.png" alt="INCFlow" width={40} height={40} />
          <div className="ligacao-titulo">
            <strong>Entrevista sobre {e.tema || 'o processo'}</strong>
            <span>{[e.convidador && `Convite de ${e.convidador}`, e.processo?.area?.nome].filter(Boolean).join(' · ')}</span>
          </div>
          {!processando && <span className="ligacao-tempo" title="Tempo de conversa"><span className="rec-dot" />{mmss(segundos)}</span>}
          {!processando && <button type="button" className="btn btn-ghost" onClick={() => void pausar()} disabled={travado} title="Pausa a entrevista e sai: a conversa fica guardada para continuar depois">Sair</button>}
        </header>
        <div className="ligacao-corpo">
          <section className="cartao ligacao-palco" data-fase={processando ? 'processando' : fase}>
            <div className="ligacao-esfera">
              <Orbe modo={processando ? 'processando' : fase === 'conectando' ? 'conectando' : 'conversa'} niveis={niveis} />
            </div>
            <p className={`ligacao-estado${fase === 'falando' && !processando ? ' falando' : ''}`} aria-live="polite">{estado}</p>
            {!processando && <p className="ligacao-dica">{fase === 'conectando' ? 'Permita o uso do microfone se o navegador perguntar.' : mudo ? 'Seu microfone está desligado: a Maia não está ouvindo você.' : LEGENDA_CONVERSA}</p>}
            {aviso && <p className="notice">{aviso}</p>}
            {erro && (
              <div className="entrevista-erro" role="alert">
                <span>{erro.texto}</span>
                {erro.repetir && <button className="btn" onClick={erro.repetir}>Tentar de novo</button>}
              </div>
            )}
            {!processando && (
              <div className="ligacao-controles">
                <button type="button" className={`ligacao-mic${mudo ? ' mudo' : ''}`} onClick={alternarMicrofone} disabled={travado} aria-pressed={mudo} aria-label={mudo ? 'Ligar o microfone' : 'Desligar o microfone'} title={mudo ? 'Ligar o microfone' : 'Desligar o microfone'}>
                  <Icone nome={mudo ? 'microfone-desligado' : 'microfone'} tamanho={22} />
                </button>
                <button className="btn ligacao-pausar" onClick={() => void pausar()} disabled={travado} title="Encerra a ligação por agora e guarda a conversa para continuar depois">Pausar</button>
                <button className="btn ligacao-encerrar" onClick={() => encerrar(true)} disabled={travado}>Encerrar entrevista</button>
              </div>
            )}
          </section>

          <section className="cartao ligacao-transcricao" aria-labelledby="titulo-transcricao">
            <div className="ligacao-transcricao-topo">
              <h2 id="titulo-transcricao">Transcrição</h2>
              <span>{processando ? 'Conversa encerrada' : 'Ao vivo'}</span>
            </div>
            <div className="ligacao-falas" ref={fimDasFalas}>
              {falas.length === 0 && <p className="ligacao-falas-vazio">{fase === 'conectando' ? 'A conversa aparece aqui assim que a Maia atender.' : 'O que vocês falarem aparece aqui.'}</p>}
              {falas.map((t, i) => (
                <div key={i} className={`fala ${t.quem === 'ia' ? 'fala-maia' : 'fala-voce'}`}>
                  <span className="fala-quem">{t.quem === 'ia' ? 'Maia' : 'Você'}{t.inicio_ms !== undefined ? ` · ${mmss(t.inicio_ms / 1000)}` : ''}</span>
                  <p>{limparMarcasDeSom(t.texto)}</p>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    );
  }

  return <Resultado e={e} aviso={aviso} erro={erro} cabecalho={cabecalho} admin={ehAdmin(eu)} minha={souEu(eu, e.entrevistado_id)} gestor={ehGestor(eu)} arquivada={arquivada} aoReprocessar={reprocessar} aoRetomar={retomar} />;
}

function Resultado({ e, aviso, erro, cabecalho, admin, minha, gestor, arquivada, aoReprocessar, aoRetomar }: {
  e: Entrevista; aviso: string; erro: { texto: string; repetir?: () => void } | null; cabecalho: React.ReactNode; admin: boolean; minha: boolean; gestor: boolean; arquivada: boolean;
  aoReprocessar: () => Promise<void>; aoRetomar: (pendencias: string[]) => Promise<void>;
}) {
  const r = e.resultado;
  const parado = e.status === 'processando' && Date.now() - new Date(e.atualizado_em).getTime() > 3 * 60_000;
  // Voltar para fechar pontos em aberto (decisão 56): a própria pessoa escolhe e liga; gestores marcam para ela.
  const [escolhidas, setEscolhidas] = useState<string[]>([]);
  const [marcando, setMarcando] = useState(false);
  const [erroRetomar, setErroRetomar] = useState('');
  const podeEscolher = e.status === 'concluida' && (minha || gestor) && !arquivada; // arquivada, não ganha complemento (decisão 72)
  const primeiroNome = e.entrevistado?.trim().split(/\s+/)[0] ?? 'a pessoa';
  async function retomar() {
    setMarcando(true);
    setErroRetomar('');
    try { await aoRetomar(escolhidas); } catch (err) { setErroRetomar(msg(err)); } finally { setMarcando(false); }
  }

  return (
    <div className="page pagina-entrevista">
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
          {arquivada
            ? <p className="notice">Restaure a entrevista para gerar o resultado de novo.</p>
            : <div className="fluxo-acoes"><button className="btn btn-primary" onClick={() => void aoReprocessar()}><Icone nome="ia" tamanho={16} />Gerar o resultado de novo</button></div>}
        </div>
      )}
      {e.status === 'concluida' && !r && (
        <div className="cartao"><h3 className="sem-margem">Entrevista encerrada sem respostas</h3><p className="notice">Nada do que você falou chegou a ser transcrito, então não há o que gerar. Abra uma nova entrevista.</p></div>
      )}

      <div className={r ? 'proc-grade entrevista-grade' : 'proc-coluna'}>
        <div className="proc-coluna">
          {r && (
            <>
              <section className="cartao" aria-labelledby="titulo-ficha">
                <div className="sec-titulo">
                  <div className="sec-cabeca">
                    <h3 id="titulo-ficha">Ficha do processo</h3>
                    <p>Montada pela Maia a partir da conversa.</p>
                  </div>
                  <span className="selo-maia"><Icone nome="ia" tamanho={14} />Gerada pela Maia</span>
                </div>
                <div className="ficha-destaques">
                  <div className="ficha-destaque fd-objetivo"><span><Icone nome="alvo" tamanho={14} />Objetivo</span><p>{r.ficha.objetivo || '—'}</p></div>
                  <div className="ficha-destaque fd-inicio"><span><Icone nome="seta-direita" tamanho={14} />Começa quando</span><p>{r.ficha.gatilho || '—'}</p></div>
                  <div className="ficha-destaque fd-fim"><span><Icone nome="check" tamanho={14} />Termina com</span><p>{r.ficha.resultado || '—'}</p></div>
                </div>
                {r.ficha.etapas.length > 0 && (
                  <>
                    <h4 className="ficha-subtitulo">Etapas</h4>
                    <ol className="ficha-etapas">
                      {r.ficha.etapas.map((et, i) => <li key={i}><span className="ficha-numero" aria-hidden="true">{i + 1}</span><FichaEtapa etapa={et} /></li>)}
                    </ol>
                  </>
                )}
                {r.ficha.dificuldades.length > 0 && (
                  <div className="ficha-caixa fc-excecao"><span className="ficha-rotulo">Dificuldades relatadas</span><ul className="ficha-lista">{r.ficha.dificuldades.map((d, i) => <li key={i}>{d}</li>)}</ul></div>
                )}
              </section>

              <section className="cartao" aria-labelledby="titulo-descricao">
                <div className="sec-titulo">
                  <h3 id="titulo-descricao">Descrição do processo</h3>
                  <span className="sec-conta">Texto corrido escrito pela Maia</span>
                </div>
                <div className="descricao-sugerida" dangerouslySetInnerHTML={{ __html: r.descricao }} />
              </section>
            </>
          )}
          <ConversaTranscrita e={e} minha={minha} aberta={!r} />
        </div>

        {r && (
          <aside className="proc-coluna">
            {r.pendencias.length > 0 && (
              <section className="cartao cartao-lateral cartao-em-aberto" id="em-aberto" aria-labelledby="titulo-em-aberto">
                <div className="lateral-topo">
                  <span className="lateral-icone icone-pessego"><Icone nome="duvida" tamanho={20} /></span>
                  <div className="lateral-titulo">
                    <h3 id="titulo-em-aberto">Ficou em aberto</h3>
                    <span>{r.pendencias.length} {r.pendencias.length === 1 ? 'dúvida da Maia' : 'dúvidas da Maia'}</span>
                  </div>
                </div>
                {podeEscolher ? (
                  <>
                    <p className="lateral-texto">{minha
                      ? 'Marque o que você quer responder e volte à ligação: a Maia pergunta só esses pontos e o resultado é refeito com a conversa inteira.'
                      : `Marque o que ${primeiroNome} deve responder: quando abrir a entrevista, a Maia pergunta só esses pontos e o resultado é refeito.`}</p>
                    <ul className="ficha-lista lista-pendencias">
                      {r.pendencias.map((p, i) => (
                        <li key={i}><label className={`check${escolhidas.includes(p) ? ' marcada' : ''}`}><input type="checkbox" checked={escolhidas.includes(p)} onChange={() => setEscolhidas((x) => (x.includes(p) ? x.filter((y) => y !== p) : [...x, p]))} />{p}</label></li>
                      ))}
                    </ul>
                    {erroRetomar && <div className="entrevista-erro" role="alert"><span>{erroRetomar}</span></div>}
                    <button className="btn btn-maia btn-largo" disabled={!escolhidas.length || marcando} onClick={() => void retomar()}>
                      <Icone nome="microfone" tamanho={16} />{marcando ? 'Marcando…' : !escolhidas.length ? 'Marque ao menos uma dúvida' : minha ? 'Voltar à ligação para responder' : `Pedir para ${primeiroNome} responder`}
                    </button>
                  </>
                ) : (
                  <>
                    <p className="lateral-texto">{arquivada ? 'Com a entrevista arquivada, não dá para pedir complemento destes pontos. Restaure a entrevista para isso.' : 'Perguntas para uma próxima conversa.'}</p>
                    <ul className="ficha-lista lista-pendencias so-leitura">{r.pendencias.map((p, i) => <li key={i}>{p}</li>)}</ul>
                  </>
                )}
              </section>
            )}

            {r.entrevistado && (r.entrevistado.area || r.entrevistado.funcao) && (
              <section className="cartao cartao-lateral" id="quem-foi-entrevistado" aria-labelledby="titulo-quem">
                <h3 id="titulo-quem">{minha ? 'Sobre você' : 'Quem foi entrevistado'}</h3>
                {!minha && e.entrevistado && (
                  <div className="quem-pessoa"><span className={`avatar avatar-${corDoAvatar(e.entrevistado)}`} aria-hidden="true">{iniciais(e.entrevistado)}</span><strong>{e.entrevistado}</strong></div>
                )}
                <dl className="ficha-resumo">
                  {r.entrevistado.area && <><dt>Área</dt><dd>{r.entrevistado.area}</dd></>}
                  {r.entrevistado.funcao && <><dt>O que faz</dt><dd>{r.entrevistado.funcao}</dd></>}
                  {e.convidador && e.convidado_em && <><dt>Convidado por</dt><dd>{e.convidador} · {new Date(e.convidado_em).toLocaleDateString('pt-BR')}</dd></>}
                </dl>
              </section>
            )}

            {(r.pendencias_outra_pessoa?.length ?? 0) > 0 && (
              <section className="cartao cartao-lateral" id="para-outra-pessoa" aria-labelledby="titulo-outra-pessoa">
                <h3 id="titulo-outra-pessoa">Para outra pessoa responder</h3>
                <p className="lateral-texto">{minha ? 'Você disse que não sabe responder: quem sabe é de outra área.' : `${primeiroNome} não soube responder: quem sabe é de outra área.`}{gestor && e.processo && !arquivada ? ' Na página do processo dá para convidar alguém de lá, já com estas perguntas.' : ''}</p>
                <ul className="ficha-lista lista-pendencias so-leitura">{r.pendencias_outra_pessoa!.map((x, i) => <li key={i}>{x.pergunta} <small>· quem sabe: {x.quem_sabe}</small></li>)}</ul>
                {gestor && e.processo && !arquivada && (
                  <Link className="btn btn-largo" href={`/app/processos/${e.processo.id}#perguntas-para-outros`}><Icone nome="mais" tamanho={16} />Convidar alguém para responder</Link>
                )}
              </section>
            )}
          </aside>
        )}
      </div>

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
      <summary><span>{titulo}</span><Icone nome="seta-baixo" tamanho={18} /></summary>
      {e.audios.map((u, i) => <audio key={u} controls src={u} className="conversa-audio" preload="none" aria-label={`Gravação ${i + 1}`} />)}
      <div className="conversa-lida">
        {e.turnos.map((t, i) => (
          <Fragment key={i}>
            {e.complemento && i === e.complemento.a_partir_do_turno && i > 0 && (
              <p className="conversa-divisor">Continuação para fechar {e.complemento.pendencias.length === 1 ? 'um ponto que ficou' : `${e.complemento.pendencias.length} pontos que ficaram`} em aberto · {new Date(e.complemento.escolhidas_em).toLocaleDateString('pt-BR')}</p>
            )}
            <p className={`${t.quem}${t.sobreposta ? ' sobreposta' : ''}${t.apoio ? ' apoio' : ''}`}>
              <span className="conversa-tempo">{t.inicio_ms !== undefined ? mmss(t.inicio_ms / 1000) : ''}</span>
              <b>{t.quem === 'ia' ? 'Maia' : quem}{t.sobreposta ? <small> (por cima da Maia)</small> : null}</b>
              <span className="conversa-fala">{limparMarcasDeSom(t.texto)}</span>
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
 * convite, a conversa até agora e as ações (reenviar ou cancelar o convite, encerrar e gerar o resultado). Arquivar
 * fica no alto da página; excluir, só depois de arquivada, na faixa (decisão 72). Arquivada, fica só para consulta.
 * Falar com a Maia continua sendo só da pessoa convidada: a conversa fica no nome dela.
 */
function GestaoDaEntrevista({ e, cabecalho, aviso, erro, arquivada, aoMudar, aoEncerrar, aoDesistir, aoExcluir }: {
  e: Entrevista; cabecalho: React.ReactNode; aviso: string; erro: string; arquivada: boolean;
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
    if (!(await confirmar(confirmacaoDeExclusao({ status: e.status, falas, entrevistado: e.entrevistado, convidado_em: e.convidado_em })))) return;
    await agir(async () => { await excluirEntrevista(e.id); aoExcluir(); }, 'Não foi possível cancelar.');
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
          <SeloSituacao entrevista={{ status: e.status, falas, em_ligacao: e.em_ligacao, entrevistado: e.entrevistado, convidado_em: e.convidado_em, convite_enviado_em: e.convite_enviado_em, complemento_pendencias: complemento?.pendencias.length ?? null }} />
        </div>
        <dl className="ficha-resumo">
          {!e.convidado_em && <><dt>Convite</dt><dd>Não houve: {primeiroNome} abriu esta entrevista por conta própria em {dataHora(e.criado_em)}.</dd></>}
          {e.convidado_em && <><dt>Convite</dt><dd>{dataHora(e.convidado_em)}{e.convidador ? `, por ${e.convidador}` : ''}{e.convite_enviado_em ? ` · e-mail enviado em ${dataHora(e.convite_enviado_em)}` : ' · o e-mail não foi enviado'}</dd></>}
          {e.nota_convite && <><dt>Pedido</dt><dd>“{e.nota_convite}”</dd></>}
          <dt>Conversa</dt>
          <dd>{pendente ? `${primeiroNome} ainda não ligou para a Maia.` : `${e.iniciada_em ? `Começou em ${dataHora(e.iniciada_em)}` : 'Começou'}${falas ? ` · ${falas} falas` : ''}${duracao_s ? ` · ${duracao_s >= 60 ? `${Math.round(duracao_s / 60)} min` : `${Math.round(duracao_s)} s`}` : ''} · pausada, ainda sem resultado.`}</dd>
          {complemento && <><dt>Completar</dt><dd>Está marcado para {primeiroNome} responder {complemento.pendencias.length === 1 ? 'um ponto que ficou' : `${complemento.pendencias.length} pontos que ficaram`} em aberto.</dd></>}
        </dl>
        {complemento && <ul className="ficha-lista">{complemento.pendencias.map((x, i) => <li key={i}>{x}</li>)}</ul>}
        <p className="notice">{arquivada
          ? 'Arquivada, esta entrevista fica só para consulta: não pode ser continuada nem encerrada. Restaure para voltar a usar.'
          : `Como administrador, você vê e gerencia esta entrevista. Só ${primeiroNome} fala com a Maia nela: a conversa fica registrada no nome de quem foi convidado.`}</p>
        <div className="fluxo-acoes">
          <Link href={e.processo ? `/app/processos/${e.processo.id}` : '/app/entrevistas'} className="btn"><Icone nome="voltar" tamanho={16} />{e.processo ? 'Voltar ao processo' : 'Voltar'}</Link>
          {pendente && e.convidado_em && <button type="button" className="btn" disabled={ocupado} onClick={() => void reenviar()} title="Manda o e-mail do convite de novo"><Icone nome="refazer" tamanho={16} />Reenviar convite</button>}
          {complemento && !arquivada && e.turnos.length === complemento.a_partir_do_turno && <button type="button" className="btn btn-ghost" disabled={ocupado} onClick={() => void agir(aoDesistir, 'Não foi possível desfazer.')} title="Fica com o resultado que já existe">Deixar como está</button>}
          {pendente && <button type="button" className="btn btn-ghost btn-excluir" disabled={ocupado} onClick={() => void excluir()} title={e.convidado_em ? 'Cancela o convite' : 'Cancela a entrevista que ainda não começou'}><Icone nome="lixo" tamanho={16} />{e.convidado_em ? 'Cancelar convite' : 'Cancelar entrevista'}</button>}
          {!pendente && !arquivada && temFala && <button type="button" className="btn btn-primary" disabled={ocupado} onClick={() => void encerrar()} title="Termina a conversa como está e gera a descrição e a ficha"><Icone nome="ia" tamanho={16} />Encerrar e gerar o resultado</button>}
          <Link href={`/app/maia/${e.id}`} className="btn btn-ghost" title="Indicadores, custos e diagnóstico desta entrevista (só administradores)"><Icone nome="ia" tamanho={16} />Custos e métricas</Link>
        </div>
      </div>
      <ConversaTranscrita e={e} minha={false} aberta titulo="Conversa até agora" />
    </div>
  );
}

function FichaEtapa({ etapa }: { etapa: Etapa }) {
  const lista = (v: string[]) => (v.length === 1 ? <p>{v[0]}</p> : <ul className="ficha-lista">{v.map((x, i) => <li key={i}>{x}</li>)}</ul>);
  return (
    <div className="ficha-etapa">
      <h4>{etapa.nome}{etapa.responsavel && <span className="ficha-resp">{etapa.responsavel}</span>}</h4>
      {etapa.descricao && <p>{etapa.descricao}</p>}
      {(etapa.entradas.length > 0 || etapa.saidas.length > 0) && (
        <div className="ficha-entra-sai">
          {etapa.entradas.length > 0 && <div className="ficha-caixa"><span className="ficha-rotulo"><Icone nome="entra" tamanho={13} />Entra</span>{lista(etapa.entradas)}</div>}
          {etapa.saidas.length > 0 && <div className="ficha-caixa"><span className="ficha-rotulo"><Icone nome="sai" tamanho={13} />Sai</span>{lista(etapa.saidas)}</div>}
        </div>
      )}
      {etapa.ferramentas.length > 0 && <div className="ficha-caixa"><span className="ficha-rotulo">Ferramentas</span>{lista(etapa.ferramentas)}</div>}
      {etapa.regras.length > 0 && <div className="ficha-caixa fc-regra"><span className="ficha-rotulo"><Icone nome="balanca" tamanho={14} />{etapa.regras.length === 1 ? 'Regra de negócio' : 'Regras de negócio'}</span>{lista(etapa.regras)}</div>}
      {etapa.excecoes.length > 0 && <div className="ficha-caixa fc-excecao"><span className="ficha-rotulo">{etapa.excecoes.length === 1 ? 'Exceção' : 'Exceções'}</span>{lista(etapa.excecoes)}</div>}
    </div>
  );
}

export default function Pagina() {
  return <Suspense><EntrevistaPage /></Suspense>;
}
