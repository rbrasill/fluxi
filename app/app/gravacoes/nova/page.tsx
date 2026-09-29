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
import { atualizarGravacao, criarGravacao, enviarArquivo, formatarTempo, registrarMarcacao, registrarSegmento } from '@/lib/gravacoes';

type Fase = 'config' | 'preparando' | 'gravando' | 'encerrando';
type TelaLocal = { chave: number; url: string; tempoMs: number; instrucao: string; status: 'enviando' | 'ok' | 'erro' };

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

  const gravador = useRef<Gravador | null>(null);
  const fila = useRef(new FilaDeEnvio(setEnviando));
  const idGravacao = useRef('');

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
    await atualizarGravacao(id, { status: falhas.length ? 'erro' : 'pronta', duracao_ms: g.tempoMs() }).catch(() => {});
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
      const { id } = await criarGravacao(nome.trim() || `Gravação de ${new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}`);
      idGravacao.current = id;
      if (g.largura && g.altura) void atualizarGravacao(id, { largura: g.largura, altura: g.altura });
    } catch (e) {
      await g.encerrar().catch(() => {});
      janela?.close();
      setFase('config');
      setErro(`Não foi possível salvar a gravação: ${mensagemDeErro(e)}`);
      return;
    }
    gravador.current = g;
    if (janela) g.usarRelogioDe(janela);
    g.iniciar();
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
      aoEncerrar={encerrar}
      flash={flash}
      previa={flutuante ? gravador.current?.previa : undefined}
      flutuante={flutuante}
    />
  );

  if (fase === 'config' || fase === 'preparando') {
    return (
      <div className="page page-estreita">
        <div className="page-head">
          <div>
            <Link href="/app/gravacoes" className="voltar"><Icone nome="voltar" tamanho={16} />Gravações</Link>
            <h1>Nova gravação de tela</h1>
            <p>Grave o passo a passo no sistema narrando o que faz. Nos momentos importantes, clique em <b>Incluir esta tela no POP</b>.</p>
          </div>
        </div>

        {!suportado && <div className="aviso erro">Este navegador não grava a tela. Use o Chrome ou o Edge no computador.</div>}
        {erro && <div className="aviso erro" role="alert">{erro}</div>}

        <section className="cartao">
          <label className="field">
            Nome da gravação
            <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Cadastro de proposta no CRM" disabled={fase !== 'config'} />
          </label>
          <div className="opcoes-grav">
            <label className="check"><input type="checkbox" checked={microfone} onChange={(e) => setMicrofone(e.target.checked)} />Gravar minha narração (microfone)</label>
            <label className="check"><input type="checkbox" checked={audioSistema} onChange={(e) => setAudioSistema(e.target.checked)} />Incluir o áudio da tela (ex.: vídeo ou reunião)</label>
          </div>
          <ol className="dicas">
            <li>Escolha a <b>janela do sistema</b> ou a aba que vai mostrar.</li>
            <li>{temPip ? <>Uma <b>janela flutuante</b> do Fluxi fica por cima de tudo com os controles.</> : <>Seu navegador não tem janela flutuante: os controles ficam nesta aba. Para a melhor experiência, use o <b>Chrome</b> ou o <b>Edge</b>.</>}</li>
            <li>Narre o que está fazendo e clique em <b>Incluir esta tela no POP</b> em cada passo importante. Se quiser, digite a instrução; se não, a IA escreve a partir da narração.</li>
          </ol>
          <p className="notice">Qualidade: até {QUALIDADE.altura}p, {QUALIDADE.quadrosPorSegundo} quadros/s. O vídeo é salvo em partes de 3 minutos, sem limite de duração.</p>
          <div className="dialog-actions">
            <button className="btn btn-gravar" onClick={iniciar} disabled={!suportado || fase !== 'config'}>
              <span className="rec-dot" />{fase === 'preparando' ? 'Escolha a tela…' : 'Iniciar gravação'}
            </button>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="page page-estreita">
      <div className="page-head">
        <div>
          <h1>{fase === 'encerrando' ? 'Finalizando a gravação…' : 'Gravando'}</h1>
          <p>
            {fase === 'encerrando'
              ? `Enviando os últimos arquivos${enviando ? ` (${enviando})` : ''}. Não feche esta aba.`
              : pip
                ? 'Os controles estão na janela flutuante. Você pode trabalhar no sistema normalmente.'
                : 'Use os controles abaixo. Não feche esta aba enquanto grava.'}
          </p>
        </div>
      </div>
      {erro && <div className="aviso erro" role="alert">{erro}</div>}

      {fase === 'gravando' && (
        <section className="cartao">
          {painel(false)}
          {!pip && temPip && (
            <button className="btn" onClick={abrirControles}><Icone nome="expandir" tamanho={16} />Abrir controles flutuantes</button>
          )}
        </section>
      )}
      {fase === 'encerrando' && <p className="form-etapa"><span className="spinner" />Salvando {formatarTempo(tempo)} de gravação e {telas.length} tela(s)…</p>}

      {telas.length > 0 && (
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
      )}

      {pip && fase === 'gravando' && createPortal(painel(true), pip.document.body)}
    </div>
  );
}
