'use client';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { Icone } from '@/components/Icone';
import { PlayerSegmentos } from '@/components/gravacao/PlayerSegmentos';
import { adicionarTelasDaGravacao, criarPop } from '@/lib/pops';
import { ROTULO_STATUS, atualizarGravacao, atualizarMarcacao, consultarProcessamento, salvarMarcacaoDesenhada, iniciarProcessamento, type EstadoProcessamento, excluirMarcacao, formatarTempo, obterGravacao, tempoGravado, type Gravacao, type Marcacao } from '@/lib/gravacoes';

const EditorMarcacao = dynamic(() => import('@/components/marcacao/EditorMarcacao'), { ssr: false });

function CartaoTela({ m, n, gravacaoId, noPop, aoIr, aoExcluir }: { m: Marcacao; n: number; gravacaoId: string; noPop?: boolean; aoIr: () => void; aoExcluir: () => void }) {
  const [instrucao, setInstrucao] = useState(m.instrucao ?? '');
  const [incluir, setIncluir] = useState(m.incluir_no_pop);
  const [salvo, setSalvo] = useState<'' | 'salvando' | 'ok' | 'erro'>('');
  const [marcando, setMarcando] = useState(false);
  const [desenho, setDesenho] = useState({ url: m.imagem_anotada_url, anotacoes: m.anotacoes });
  const imagem = desenho.url ?? m.imagem_url;

  async function salvar(dados: { instrucao?: string | null; incluir_no_pop?: boolean }) {
    setSalvo('salvando');
    try {
      await atualizarMarcacao(gravacaoId, m.id, dados);
      setSalvo('ok');
    } catch {
      setSalvo('erro');
    }
  }

  return (
    <article className={`tela-cartao ${incluir ? '' : 'excluida'}`}>
      <button type="button" className="tela-img" onClick={() => m.imagem_url && setMarcando(true)} title="Marcar onde clicar nesta tela">
        {imagem ? <img src={imagem} alt={`Tela ${n}`} /> : <span>Imagem indisponível</span>}
        <span className="tela-num">{n}</span>
        {desenho.url && <span className="tela-marcada">Marcada</span>}
        {noPop && <span className="tela-no-pop">No POP</span>}
      </button>
      <div className="tela-corpo">
        <div className="tela-meta">
          <button className="btn btn-ghost" onClick={aoIr} title="Ver este momento no vídeo"><Icone nome="play" tamanho={14} />{formatarTempo(m.tempo_ms)}</button>
          <button className="btn btn-ghost" onClick={() => setMarcando(true)} disabled={!m.imagem_url} title="Desenhar caixa, seta, número ou texto, e recortar"><Icone nome="marcar" tamanho={14} />Marcar</button>
          <label className="check">
            <input type="checkbox" checked={incluir} onChange={(e) => { setIncluir(e.target.checked); void salvar({ incluir_no_pop: e.target.checked }); }} />
            Incluir no POP
          </label>
          <button className="btn btn-ghost btn-icon" aria-label="Excluir tela" title="Excluir tela" onClick={aoExcluir}><Icone nome="lixo" tamanho={16} /></button>
        </div>
        <label className="field">
          Instrução do passo
          <textarea
            rows={3}
            value={instrucao}
            onChange={(e) => setInstrucao(e.target.value)}
            onBlur={() => instrucao !== (m.instrucao ?? '') && void salvar({ instrucao: instrucao.trim() || null })}
            placeholder={m.instrucao_ia ?? 'Descreva o que fazer nesta tela. Se ficar vazio, a IA sugere a partir da narração.'}
          />
        </label>
        {salvo && <span className={`salvo salvo-${salvo}`}>{salvo === 'salvando' ? 'Salvando…' : salvo === 'ok' ? 'Salvo' : 'Erro ao salvar'}</span>}
      </div>
      {marcando && m.imagem_url && (
        <EditorMarcacao
          imagemUrl={m.imagem_url}
          anotacoes={desenho.anotacoes}
          titulo={`Tela ${n} · ${formatarTempo(m.tempo_ms)}`}
          aoFechar={() => setMarcando(false)}
          aoSalvar={async (r) => {
            const url = await salvarMarcacaoDesenhada({ gravacao_id: gravacaoId }, m.id, r);
            setDesenho({ url, anotacoes: r?.anotacoes ?? null });
            setMarcando(false);
          }}
        />
      )}
    </article>
  );
}

const ETAPA: Record<string, string> = {
  transcrevendo: 'Transcrevendo a narração…',
  analisando: 'A IA está escrevendo o POP e o fluxograma… (1 a 3 min)',
};

function PainelIA({ gravacaoId }: { gravacaoId: string }) {
  const [e, setE] = useState<EstadoProcessamento | null>(null);
  const [erro, setErro] = useState('');
  const emAndamento = e?.processamento === 'transcrevendo' || e?.processamento === 'analisando';

  useEffect(() => { consultarProcessamento(gravacaoId).then(setE).catch(() => {}); }, [gravacaoId]);
  useEffect(() => {
    if (!emAndamento) return;
    const t = setTimeout(() => consultarProcessamento(gravacaoId).then(setE).catch(() => {}), 5000);
    return () => clearTimeout(t);
  }, [gravacaoId, e, emAndamento]);

  async function gerar() {
    setErro('');
    try { setE(await iniciarProcessamento(gravacaoId)); } catch (x) { setErro(x instanceof Error ? x.message : 'Erro ao iniciar.'); }
  }

  if (!e) return null;
  if (e.processamento === 'pronto') {
    return (
      <div className="aviso">
        POP e fluxograma gerados pela IA. Revise antes de publicar.
        {e.fluxograma_id && <Link className="btn" href={`/app/fluxogramas/${e.fluxograma_id}`}>Abrir fluxograma</Link>}
        {e.pop_id && <Link className="btn btn-primary" href={`/app/pops/${e.pop_id}`}>Abrir POP</Link>}
      </div>
    );
  }
  if (emAndamento) {
    const seg = e.processamento === 'transcrevendo' && e.segmentos.total > 1 ? ` (${e.segmentos.prontos}/${e.segmentos.total} partes)` : '';
    return <div className="aviso">{ETAPA[e.processamento]}{seg} Pode sair desta página; o andamento continua quando você voltar.</div>;
  }
  return (
    <div className={`aviso ${e.processamento === 'erro' || erro ? 'erro' : ''}`}>
      {erro || e.erro || 'A IA transcreve a narração e escreve o POP e o fluxograma a partir da gravação e das telas marcadas.'}
      <button className="btn btn-primary" onClick={gerar}><Icone nome="pop" tamanho={16} />{e.processamento === 'erro' ? 'Tentar de novo' : 'Gerar POP e fluxograma com IA'}</button>
    </div>
  );
}

function Detalhe() {
  const { id } = useParams<{ id: string }>();
  const falhas = useSearchParams().get('falhas');
  const [g, setG] = useState<Gravacao | null | undefined>(undefined);
  const [nome, setNome] = useState('');
  const [irPara, setIrPara] = useState<{ ms: number; n: number } | null>(null);
  const [criandoPop, setCriandoPop] = useState(false);
  const [levando, setLevando] = useState<'' | 'enviando' | 'ok'>('');
  const router = useRouter();

  useEffect(() => {
    obterGravacao(id).then((d) => { setG(d); setNome(d.nome); }).catch(() => setG(null));
  }, [id]);

  if (g === undefined) return <div className="page"><p className="notice">Carregando…</p></div>;
  if (g === null) {
    return (
      <div className="page"><div className="empty"><h2>Gravação não encontrada</h2><Link href="/app/gravacoes" className="btn btn-primary">Voltar</Link></div></div>
    );
  }

  const incluidas = g.marcacoes.filter((m) => m.incluir_no_pop).length;
  const comIa = g.status === 'pronta' && g.segmentos.length > 0;
  // Gravação que ainda pode receber mais conteúdo: pausada pela pessoa ou não finalizada (aba fechada no meio).
  const emAberto = g.status === 'pausada' || g.status === 'gravando' || g.status === 'interrompida';
  const gravado = tempoGravado(g);
  // Telas marcadas depois de o POP existir (ex.: gravação continuada) ainda não estão nele.
  const telasNovas = g.pop ? g.marcacoes.filter((m) => m.incluir_no_pop && !g.pop!.telas.includes(m.id)) : [];

  async function finalizarAssim() {
    await atualizarGravacao(g!.id, { status: 'pronta', duracao_ms: gravado });
    setG({ ...g!, status: 'pronta', duracao_ms: gravado });
  }

  async function levarTelasAoPop() {
    setLevando('enviando');
    try {
      await adicionarTelasDaGravacao(g!.pop!.id, g!.id);
      setG({ ...g!, pop: { ...g!.pop!, telas: [...g!.pop!.telas, ...telasNovas.map((m) => m.id)] } });
      setLevando('ok');
    } catch {
      setLevando('');
      alert('Não foi possível levar as telas para o POP.');
    }
  }

  async function criarPopDaGravacao() {
    setCriandoPop(true);
    try {
      const { id: popId } = await criarPop({ gravacao_id: g!.id });
      router.push(`/app/pops/${popId}`);
    } catch {
      setCriandoPop(false);
      alert('Não foi possível criar o POP.');
    }
  }

  async function remover(m: Marcacao) {
    if (!confirm('Excluir esta tela marcada?')) return;
    await excluirMarcacao(g!.id, m.id);
    setG({ ...g!, marcacoes: g!.marcacoes.filter((x) => x.id !== m.id) });
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          {g.processo
            ? <Link href={`/app/processos/${g.processo.id}`} className="voltar"><Icone nome="voltar" tamanho={16} />{g.processo.nome}</Link>
            : <Link href="/app/gravacoes" className="voltar"><Icone nome="voltar" tamanho={16} />Gravações</Link>}
          <input
            className="titulo-editavel"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            onBlur={() => nome.trim() && nome !== g.nome && void atualizarGravacao(g.id, { nome: nome.trim() })}
            aria-label="Nome da gravação"
          />
          <p>{gravado ? formatarTempo(gravado) : '--:--'} de gravação · {g.marcacoes.length} telas marcadas · {incluidas} no POP{emAberto && <> · <b>{ROTULO_STATUS[g.status]}</b></>}</p>
        </div>
        <div className="actions">
          {g.status === 'pronta' && (
            <Link href={`/app/gravacoes/nova?continuar=${g.id}`} className="btn btn-ghost" title="Grava mais uma parte, em sequência, sem perder nada do que já foi gravado"><span className="rec-dot" />Continuar gravando</Link>
          )}
          {/* Com áudio, o caminho principal é a IA (painel abaixo); este fica como alternativa sem IA. */}
          <button className={`btn ${comIa ? '' : 'btn-primary'}`} onClick={criarPopDaGravacao} disabled={criandoPop || incluidas === 0}
            title={incluidas === 0 ? 'Marque ao menos uma tela como “Incluir no POP”' : 'Cria o POP só com as telas marcadas e suas instruções, sem IA'}>
            <Icone nome="pop" tamanho={16} />{criandoPop ? 'Criando POP…' : comIa ? 'Criar POP sem IA' : 'Criar POP com estas telas'}
          </button>
        </div>
      </div>
      {emAberto && (
        <div className="aviso retomar">
          <span>
            {g.status === 'pausada' ? <b>Gravação pausada em {formatarTempo(gravado)}.</b> : <b>Esta gravação não foi finalizada.</b>}
            {' '}Tudo o que foi gravado está salvo. Continue de onde parou: a nova parte entra em sequência. Se já tem tudo o que precisa, finalize assim.
          </span>
          <span className="aviso-acoes">
            <button className="btn" onClick={finalizarAssim}><Icone nome="check" tamanho={16} />Finalizar assim</button>
            <Link href={`/app/gravacoes/nova?continuar=${g.id}`} className="btn btn-primary"><span className="rec-dot" />Continuar gravação</Link>
          </span>
        </div>
      )}
      {comIa && <PainelIA gravacaoId={g.id} />}
      {g.pop && (telasNovas.length > 0 || levando === 'ok') && (
        <div className="aviso">
          {levando === 'ok'
            ? <span>As telas novas entraram no POP <b>{g.pop.nome}</b>, num procedimento novo no fim. Revise e organize lá.</span>
            : <span><b>{telasNovas.length} {telasNovas.length === 1 ? 'tela nova' : 'telas novas'}</b> ainda não {telasNovas.length === 1 ? 'está' : 'estão'} no POP <b>{g.pop.nome}</b>.</span>}
          <span className="aviso-acoes">
            <Link href={`/app/pops/${g.pop.id}`} className="btn">Abrir POP</Link>
            {levando !== 'ok' && <button className="btn btn-primary" onClick={levarTelasAoPop} disabled={levando === 'enviando'}><Icone nome="pop" tamanho={16} />{levando === 'enviando' ? 'Levando…' : 'Levar as telas para o POP'}</button>}
          </span>
        </div>
      )}
      {(falhas || g.status === 'erro') && <div className="aviso erro">Parte dos arquivos não foi enviada (conexão instável). O que foi salvo está abaixo.</div>}

      <div className="grav-layout">
        <PlayerSegmentos segmentos={g.segmentos} irPara={irPara} marcacoes={g.marcacoes.map((m) => m.tempo_ms)} />
        <section className="grav-telas">
          <h2>Telas para o POP</h2>
          {g.marcacoes.length === 0 && <p className="notice">Nenhuma tela foi marcada nesta gravação.</p>}
          {g.marcacoes.map((m, i) => (
            <CartaoTela key={m.id} m={m} n={i + 1} gravacaoId={g.id} noPop={g.pop?.telas.includes(m.id)} aoIr={() => setIrPara({ ms: m.tempo_ms, n: Date.now() })} aoExcluir={() => remover(m)} />
          ))}
        </section>
      </div>

      {g.falas.length > 0 && (
        <details className="transcricao" open>
          <summary>Transcrição da narração</summary>
          <div className="falas">
            {g.falas.map((f, i) => (
              <p key={i} className="fala">
                <button onClick={() => setIrPara({ ms: f.inicio_ms, n: Date.now() })} title="Ver este momento no vídeo">{formatarTempo(f.inicio_ms)}</button>
                <span><b>Falante {f.falante}</b>{f.texto}</span>
              </p>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

export default function GravacaoPage() {
  return <Suspense><Detalhe /></Suspense>;
}
