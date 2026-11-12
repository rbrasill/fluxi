'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icone } from '@/components/Icone';
import { PainelGravacao } from '@/components/gravacao/PainelGravacao';
import { abrirPip, suportaPip } from '@/components/gravacao/pip';
import { FilaDeEnvio } from '@/lib/gravacao/envio';
import { Gravador, type Segmento } from '@/lib/gravacao/gravador';
import { QUALIDADE, extensaoDe } from '@/lib/gravacao/config';
import { obterPop } from '@/lib/pops';
import { atualizarGravacao, criarGravacao, enviarArquivo, formatarTempo, obterGravacao, registrarMarcacao, registrarSegmento, tempoGravado } from '@/lib/gravacoes';

type Fase = 'config' | 'preparando' | 'gravando' | 'encerrando';
type TelaLocal = { chave: number; url: string; tempoMs: number; instrucao: string; status: 'enviando' | 'ok' | 'erro' };
// Gravação pausada que está sendo continuada (?continuar=): o tempo e as partes seguem de onde pararam.
type Continuacao = { id: string; tempoMs: number; proximoIndice: number; totalTelas: number };

function mensagemDeErro(e: unknown) {
  if (e instanceof DOMException && e.name === 'NotAllowedError') return 'O compartilhamento da tela foi cancelado ou não foi permitido.';
  if (e instanceof DOMException && e.name === 'NotFoundError') return 'Nenhuma tela disponível para gravar.';
  return e instanceof Error ? e.message : 'Não foi possível iniciar a gravação.';
}

export default function NovaGravacaoPage() {
  const router = useRouter();
  const [nome, setNome] = useState('');
  const [microfone, setMicrofone] = useState(true);
  const [audioSistema, setAudioSistema] = useState(false);
  const [fase, setFase] = useState<Fase>('config');
  const [erro, setErro] = useState('');
  const [pip, setPip] = useState<Window | null>(null);
  const [tempo, setTempo] = useState(0);
  const [pausado, setPausado] = useState(false);
  const [instrucao, setInstrucao] = useState('');
  const [telas, setTelas] = useState<TelaLocal[]>([]);
  const [enviando, setEnviando] = useState(0);
  const [flash, setFlash] = useState(0);
  const [suportado, setSuportado] = useState(true);
  const [temPip, setTemPip] = useState(true);
  // POP de onde a gravação foi aberta (?pop=): a gravação nasce nele (decisão 31); título e "voltar" apontam para ele.
  const [pop, setPop] = useState<{ id: string; nome: string; processo?: { id: string; nome: string } | null } | null>(null);
  const [semPop, setSemPop] = useState(false);
  const [continuacao, setContinuacao] = useState<Continuacao | null>(null);

  useEffect(() => {
    const q = new URLSearchParams(location.search);
    const pid = q.get('pop');
    if (pid) obterPop(pid).then((p) => { setPop({ id: p.id, nome: p.nome, processo: p.processo ? { id: p.processo.id, nome: p.processo.nome } : null }); setNome((n) => n || p.nome); }).catch(() => setSemPop(true));
    const cid = q.get('continuar');
    if (!pid && !cid) setSemPop(true);
    if (cid) {
      obterGravacao(cid).then((g) => {
        setContinuacao({ id: g.id, tempoMs: tempoGravado(g), proximoIndice: Math.max(-1, ...g.segmentos.map((s) => s.indice)) + 1, totalTelas: g.marcacoes.length });
        setNome(g.nome);
        if (g.pop) setPop({ id: g.pop.id, nome: g.pop.nome, processo: g.processo ? { id: g.processo.id, nome: g.processo.nome } : null });
        // As telas já marcadas entram na lista, para o contador seguir de onde parou.
        setTelas(g.marcacoes.map((m) => ({ chave: m.tempo_ms, url: m.imagem_anotada_url ?? m.imagem_url ?? '', tempoMs: m.tempo_ms, instrucao: m.instrucao ?? '', status: 'ok' })));
      }).catch(() => setErro('Não foi possível abrir a gravação para continuar.'));
    }
  }, []);

  const gravador = useRef<Gravador | null>(null);
  const fila = useRef(new FilaDeEnvio(setEnviando));
  const idGravacao = useRef('');
  const continuarDepois = useRef(false);

  useEffect(() => {
    setSuportado(Gravador.suportado());
    setTemPip(suportaPip());
  }, []);

  // Relógio da tela (usa a janela flutuante quando aberta: ela não é desacelerada pelo navegador).
  useEffect(() => {
    if (fase !== 'gravando') return;
    const j = pip ?? window;
    const t = j.setInterval(() => setTempo(gravador.current?.tempoMs() ?? 0), 250);
    return () => j.clearInterval(t);
  }, [fase, pip]);

  // Aviso ao sair no meio da gravação.
  useEffect(() => {
    if (fase !== 'gravando' && fase !== 'encerrando') return;
    const aviso = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', aviso);
    return () => window.removeEventListener('beforeunload', aviso);
  }, [fase]);

  const aoSegmento = useCallback((s: Segmento) => {
    const id = idGravacao.current;
    fila.current.adicionar(`parte ${s.indice + 1} do vídeo`, async () => {
      const caminho = await enviarArquivo(id, 'segmento', s.blob, extensaoDe(s.mime));
      await registrarSegmento(id, { indice: s.indice, caminho, inicio_ms: s.inicioMs, duracao_ms: s.duracaoMs, bytes: s.blob.size, mime: s.mime });
    });
  }, []);

  const aoEncerrar = useCallback(async () => {
    setFase('encerrando');
    const g = gravador.current!;
    await fila.current.esperar();
    const id = idGravacao.current;
    const falhas = fila.current.erros;
    const status = falhas.length ? 'erro' : continuarDepois.current ? 'pausada' : 'pronta';
    await atualizarGravacao(id, { status, duracao_ms: g.tempoMs() }).catch(() => {});
    (window as unknown as { documentPictureInPicture?: { window: Window | null } }).documentPictureInPicture?.window?.close();
    router.push(`/app/gravacoes/${id}${falhas.length ? '?falhas=1' : ''}`);
  }, [router]);

  async function abrirControles() {
    try {
      const j = await abrirPip();
      if (!j) return null;
      j.addEventListener('pagehide', () => setPip(null), { once: true });
      setPip(j);
      gravador.current?.usarRelogioDe(j);
      return j;
    } catch {
      return null;
    }
  }

  async function iniciar() {
    setErro('');
    setFase('preparando');
    // A janela flutuante precisa ser aberta no clique; depois o navegador pede a tela.
    const janela = await abrirControles();
    const g = new Gravador({ aoSegmento, aoEncerrar });
    try {
      await g.preparar({ microfone, audioDoSistema: audioSistema });
    } catch (e) {
      janela?.close();
      setFase('config');
      setErro(mensagemDeErro(e));
      return;
    }
    try {
      if (continuacao) {
        idGravacao.current = continuacao.id;
        await atualizarGravacao(continuacao.id, { status: 'gravando', ...(g.largura && g.altura ? { largura: g.largura, altura: g.altura } : {}) });
      } else {
        const popId = new URLSearchParams(location.search).get('pop');
        if (!popId) throw new Error('Abra um POP e use “Gravar tela”.');
        const { id } = await criarGravacao(nome.trim() || `Gravação de ${new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}`, popId);
        idGravacao.current = id;
        if (g.largura && g.altura) void atualizarGravacao(id, { largura: g.largura, altura: g.altura });
      }
    } catch (e) {
      await g.encerrar().catch(() => {});
      janela?.close();
      setFase('config');
      setErro(`Não foi possível salvar a gravação: ${mensagemDeErro(e)}`);
      return;
    }
    gravador.current = g;
    if (janela) g.usarRelogioDe(janela);
    g.iniciar(continuacao ? { tempoMs: continuacao.tempoMs, proximoIndice: continuacao.proximoIndice } : undefined);
    setTempo(g.tempoMs());
    setFase('gravando');
  }

  async function marcar() {
    const g = gravador.current;
    if (!g || fase !== 'gravando') return;
    const texto = instrucao.trim();
    setInstrucao('');
    let q;
    try {
      q = await g.capturarQuadro();
    } catch (e) {
      setErro(mensagemDeErro(e));
      return;
    }
    setFlash((f) => f + 1);
    const chave = Date.now();
    setTelas((t) => [...t, { chave, url: URL.createObjectURL(q.blob), tempoMs: q.tempoMs, instrucao: texto, status: 'enviando' }]);
    const id = idGravacao.current;
    const marcarStatus = (status: TelaLocal['status']) => setTelas((t) => t.map((x) => (x.chave === chave ? { ...x, status } : x)));
    fila.current.adicionar('tela marcada', async () => {
      try {
        const caminho = await enviarArquivo(id, 'imagem', q.blob, 'png');
        await registrarMarcacao(id, { tempo_ms: q.tempoMs, imagem_caminho: caminho, instrucao: texto || undefined, largura: q.largura, altura: q.altura });
        marcarStatus('ok');
      } catch (e) {
        marcarStatus('erro');
        throw e;
      }
    });
  }

  const pausar = () => { gravador.current?.pausar(); setPausado(true); setTempo(gravador.current?.tempoMs() ?? 0); };
  const retomar = () => { gravador.current?.retomar(); setPausado(false); };
  const encerrar = () => void gravador.current?.encerrar();
  // Libera a tela e deixa a gravação pausada: a pessoa retoma pela página da gravação.
  const continuarOutroDia = () => { continuarDepois.current = true; void gravador.current?.encerrar(); };

  const painel = (flutuante: boolean) => (
    <PainelGravacao
      tempoMs={tempo}
      pausado={pausado}
      totalTelas={telas.length}
      enviando={enviando}
      instrucao={instrucao}
      aoMudarInstrucao={setInstrucao}
      aoMarcar={marcar}
      aoPausar={pausar}
      aoRetomar={retomar}
      aoContinuarDepois={continuarOutroDia}
      aoEncerrar={encerrar}
      flash={flash}
      previa={flutuante ? gravador.current?.previa : undefined}
      flutuante={flutuante}
      telaInteira={gravador.current?.superficie === 'monitor'}
    />
  );

  const grade = telas.length > 0 && (
    <section className="telas-grid">
      {telas.map((t, i) => (
        <figure key={t.chave} className="tela-mini">
          <img src={t.url} alt={`Tela ${i + 1}`} />
          <figcaption>
            <span className="code">{formatarTempo(t.tempoMs)}</span>
            <span className={`status-${t.status}`}>{t.status === 'ok' ? 'salva' : t.status === 'erro' ? 'erro no envio' : 'enviando…'}</span>
          </figcaption>
          {t.instrucao && <p>{t.instrucao}</p>}
        </figure>
      ))}
    </section>
  );

  if (semPop && !continuacao) {
    return (
      <div className="page page-estreita">
        <div className="empty">
          <h2>A gravação é feita a partir do POP</h2>
          <p>Abra o POP que você está escrevendo e, na seção <b>Gravações de tela</b>, clique em <b>Gravar tela</b>.</p>
          <Link href="/app/pops" className="btn btn-primary">Ir para os POPs</Link>
        </div>
      </div>
    );
  }

  if (fase === 'config' || fase === 'preparando') {
    return (
      <div className="page page-estreita">
        <div className="page-head">
          <div>
            {pop
              ? <Link href={`/app/pops/${pop.id}`} className="voltar"><Icone nome="voltar" tamanho={16} />{pop.nome}</Link>
              : <Link href="/app/inicio" className="voltar"><Icone nome="voltar" tamanho={16} />Início</Link>}
            <h1>{continuacao ? 'Continuar a gravação' : 'Gravar a tela para o POP'}</h1>
            <p>Grave o passo a passo no sistema narrando o que faz. Nos momentos importantes, clique em <b>Incluir esta tela no POP</b>: as telas marcadas ficam disponíveis como print dos passos.</p>
          </div>
        </div>

        {!suportado && <div className="aviso erro">Este navegador não grava a tela. Use o Chrome ou o Edge no computador.</div>}
        {erro && <div className="aviso erro" role="alert">{erro}</div>}

        <section className="cartao">
          {continuacao && (
            <div className="aviso">
              <b>{formatarTempo(continuacao.tempoMs)}</b> já gravados e <b>{continuacao.totalTelas} {continuacao.totalTelas === 1 ? 'tela marcada' : 'telas marcadas'}</b>. Tudo isso fica; a tela que você escolher agora entra em sequência, a partir de {formatarTempo(continuacao.tempoMs)}.
            </div>
          )}
          <label className="field">
            Nome da gravação
            <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome da gravação" disabled={fase !== 'config' || !!continuacao} />
          </label>
          <div className="opcoes-grav">
            <label className="check"><input type="checkbox" checked={microfone} onChange={(e) => setMicrofone(e.target.checked)} />Gravar minha narração (microfone)</label>
            <label className="check"><input type="checkbox" checked={audioSistema} onChange={(e) => setAudioSistema(e.target.checked)} />Incluir o áudio da tela (ex.: vídeo ou reunião)</label>
          </div>
          <ol className="dicas">
            <li>Escolha a <b>janela do sistema</b> (aba "Janela") ou a aba do navegador. Evite "Tela inteira": nela, a janelinha de controles aparece nos prints.</li>
            <li>{temPip ? <>Uma <b>janela flutuante</b> do INCFlow fica por cima de tudo com os controles.</> : <>Seu navegador não tem janela flutuante: os controles ficam nesta aba. Para a melhor experiência, use o <b>Chrome</b> ou o <b>Edge</b>.</>}</li>
            <li>Narre o que está fazendo e clique em <b>Incluir esta tela no POP</b> em cada passo importante. Se quiser, digite a instrução: ela vai junto quando a tela for levada para o POP.</li>
          </ol>
          <p className="notice">Qualidade: até {QUALIDADE.altura}p, {QUALIDADE.quadrosPorSegundo} quadros/s. O vídeo é salvo em partes de 3 minutos, sem limite de duração.</p>
          <div className="dialog-actions">
            <button className="btn btn-gravar" onClick={iniciar} disabled={!suportado || fase !== 'config'}>
              <span className="rec-dot" />{fase === 'preparando' ? 'Escolha a tela…' : continuacao ? 'Continuar gravação' : 'Iniciar gravação'}
            </button>
          </div>
        </section>
        {continuacao && grade}
      </div>
    );
  }

  const titulo = fase === 'encerrando' ? (continuarDepois.current ? 'Pausando a gravação…' : 'Finalizando a gravação…') : pausado ? 'Gravação pausada' : 'Gravando';
  return (
    <div className="page pagina-gravando">
      <nav className="trilha" aria-label="Caminho">
        {pop?.processo && <><span>{pop.processo.nome}</span><Icone nome="avancar" tamanho={14} /></>}
        {pop && <><span>POP {pop.nome}</span><Icone nome="avancar" tamanho={14} /></>}
        <span aria-current="page">{continuacao ? 'Continuar gravação' : 'Nova gravação'}</span>
      </nav>
      <div className="page-head">
        <div>
          <h1 className="titulo-gravando">{titulo}{fase === 'gravando' && <span className={`selo-rec${pausado ? ' pausado' : ''}`}><span className="rec-dot" />{pausado ? 'PAUSADO' : 'REC'}</span>}</h1>
          <p>
            {fase === 'encerrando'
              ? `Enviando os últimos arquivos${enviando ? ` (${enviando})` : ''}. Não feche esta aba.`
              : <>{pop ? `Gravando para o POP ${pop.nome}. ` : ''}{pip
                ? 'Os controles também estão na janela flutuante, então você pode trabalhar no sistema normalmente.'
                : 'Use os controles abaixo. Não feche esta aba enquanto grava.'}</>}
          </p>
        </div>
      </div>
      {erro && <div className="aviso erro" role="alert">{erro}</div>}
      {fase === 'encerrando' && <p className="form-etapa"><span className="spinner" />Salvando {formatarTempo(tempo)} de gravação e {telas.length} tela(s)…</p>}

      <div className="proc-grade gravando-grade">
        <div className="proc-coluna">
          {fase === 'gravando' && <section className="cartao">{painel(false)}</section>}
          <section className="cartao lista-pops-cartao" aria-labelledby="titulo-telas-marcadas">
            <div className="telas-marcadas-topo">
              <h2 id="titulo-telas-marcadas">Telas marcadas</h2>
              <span>{telas.length} {telas.length === 1 ? 'tela marcada' : 'telas marcadas'}</span>
            </div>
            {telas.length === 0
              ? <p className="telas-marcadas-vazio">Nenhuma tela marcada ainda. A cada passo importante, clique em “Incluir esta tela no POP”.</p>
              : <div className="telas-marcadas-corpo">{grade}</div>}
          </section>
        </div>
        <aside className="proc-coluna">
          <section className="cartao cartao-lateral">
            <h3>Janela flutuante</h3>
            <p className="lateral-texto">{temPip
              ? 'Os mesmos controles ficam numa janelinha por cima do sistema que você está gravando. Pode trabalhar normalmente.'
              : 'Este navegador não tem janela flutuante: os controles ficam só nesta aba. No Chrome ou no Edge, eles ficam por cima do sistema que você está gravando.'}</p>
            {temPip && (
              <div className="pip-ilustracao" aria-hidden="true">
                <span /><span /><span />
                <div className="pip-pilula"><i />{formatarTempo(tempo)}<b>Incluir tela</b><em /></div>
              </div>
            )}
            {!pip && temPip && fase === 'gravando' && <button className="btn btn-largo" onClick={abrirControles}><Icone nome="expandir" tamanho={16} />Abrir a janela flutuante</button>}
          </section>
          <section className="cartao cartao-lateral">
            <h3>Para uma boa gravação</h3>
            <ol className="dicas-numeradas">
              <li>Faça o processo no ritmo normal, como se ninguém estivesse olhando.</li>
              <li>Inclua a tela logo depois de cada ação importante, não antes.</li>
              <li>Pause antes de abrir algo com dados sensíveis.</li>
            </ol>
          </section>
        </aside>
      </div>

      {pip && fase === 'gravando' && createPortal(painel(true), pip.document.body)}
    </div>
  );
}
