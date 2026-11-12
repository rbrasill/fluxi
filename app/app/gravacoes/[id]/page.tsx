'use client';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useState } from 'react';
import { Icone } from '@/components/Icone';
import { avisar, confirmar } from '@/components/Dialogos';
import { PlayerSegmentos } from '@/components/gravacao/PlayerSegmentos';
import { adicionarTelasDaGravacao } from '@/lib/pops';
import { ROTULO_STATUS, atualizarGravacao, atualizarMarcacao, confirmacaoExcluirGravacao, excluirGravacao, salvarMarcacaoDesenhada, excluirMarcacao, formatarTempo, obterGravacao, tempoGravado, type Gravacao, type Marcacao } from '@/lib/gravacoes';

const EditorMarcacao = dynamic(() => import('@/components/marcacao/EditorMarcacao'), { ssr: false });

function CartaoTela({ m, n, gravacaoId, noPop, aoIr, aoExcluir, aoIncluir }: { m: Marcacao; n: number; gravacaoId: string; noPop?: boolean; aoIr: () => void; aoExcluir: () => void; aoIncluir: (incluir: boolean) => void }) {
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
          <button className="chip-tempo" onClick={aoIr} title="Ver este momento no vídeo"><Icone nome="play" tamanho={12} />{formatarTempo(m.tempo_ms)}</button>
          <button className="btn btn-ghost" onClick={() => setMarcando(true)} disabled={!m.imagem_url} title="Desenhar caixa, seta, número ou texto, e recortar"><Icone nome="marcar" tamanho={15} />Marcar na tela</button>
          <label className="check">
            <input type="checkbox" checked={incluir} onChange={(e) => { setIncluir(e.target.checked); aoIncluir(e.target.checked); void salvar({ incluir_no_pop: e.target.checked }); }} />
            Incluir no POP
          </label>
          <button className="btn btn-ghost btn-icon btn-lixo" aria-label="Excluir tela" title="Excluir tela" onClick={aoExcluir}><Icone nome="lixo" tamanho={16} /></button>
        </div>
        <label className="field">
          Instrução do passo
          <textarea
            rows={2}
            value={instrucao}
            onChange={(e) => setInstrucao(e.target.value)}
            onBlur={() => instrucao !== (m.instrucao ?? '') && void salvar({ instrucao: instrucao.trim() || null })}
            placeholder={m.instrucao_ia ?? 'Descreva o que fazer nesta tela. O texto vai junto quando a tela for levada para o POP.'}
          />
        </label>
        {salvo && salvo !== 'ok' && <span className={`salvo salvo-${salvo}`}>{salvo === 'salvando' ? 'Salvando…' : 'Erro ao salvar'}</span>}
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

function Detalhe() {
  const { id } = useParams<{ id: string }>();
  const falhas = useSearchParams().get('falhas');
  const [g, setG] = useState<Gravacao | null | undefined>(undefined);
  const [nome, setNome] = useState('');
  const [irPara, setIrPara] = useState<{ ms: number; n: number } | null>(null);
  const [levando, setLevando] = useState<'' | 'enviando' | 'ok'>('');
  const [excluindo, setExcluindo] = useState(false);
  const [menu, setMenu] = useState(false);
  const router = useRouter();

  const recarregar = useCallback(() => obterGravacao(id).then((d) => { setG(d); setNome(d.nome); }).catch(() => setG(null)), [id]);
  useEffect(() => { void recarregar(); }, [recarregar]);

  if (g === undefined) return <div className="page"><p className="notice">Carregando…</p></div>;
  if (g === null) {
    return (
      <div className="page"><div className="empty"><h2>Gravação não encontrada</h2><Link href="/app/inicio" className="btn btn-primary">Voltar</Link></div></div>
    );
  }

  const incluidas = g.marcacoes.filter((m) => m.incluir_no_pop).length;
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
      void avisar('Não foi possível levar as telas para o POP.', 'Tente de novo em instantes.');
    }
  }

  // Exclusão definitiva, com confirmação. As telas que já estão no POP continuam lá.
  async function excluirTudo() {
    const noPop = g!.pop ? g!.marcacoes.filter((m) => g!.pop!.telas.includes(m.id)).length : 0;
    if (!(await confirmar(confirmacaoExcluirGravacao(g!.nome, noPop)))) return;
    setExcluindo(true);
    try {
      await excluirGravacao(g!.id);
      router.replace(g!.pop ? `/app/pops/${g!.pop.id}` : g!.processo ? `/app/processos/${g!.processo.id}` : '/app/inicio');
    } catch {
      setExcluindo(false);
      void avisar('Não foi possível excluir a gravação.', 'Tente de novo em instantes.');
    }
  }

  async function remover(m: Marcacao) {
    if (!(await confirmar({ titulo: 'Excluir esta tela marcada?', mensagem: 'A imagem e as marcações desenhadas nela são apagadas.', acao: 'Excluir', perigo: true }))) return;
    await excluirMarcacao(g!.id, m.id);
    setG({ ...g!, marcacoes: g!.marcacoes.filter((x) => x.id !== m.id) });
  }

  const noPop = g.pop ? g.marcacoes.filter((m) => g.pop!.telas.includes(m.id)).length : 0;
  const contar = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

  return (
    <div className="page pagina-gravacao">
      <nav className="trilha" aria-label="Caminho">
        {g.processo && <><Link href={`/app/processos/${g.processo.id}`}>{g.processo.nome}</Link><Icone nome="avancar" tamanho={14} /></>}
        {g.pop && <><Link href={`/app/pops/${g.pop.id}`}>POP {g.pop.nome}</Link><Icone nome="avancar" tamanho={14} /></>}
        {!g.processo && !g.pop && <><Link href="/app/inicio">Início</Link><Icone nome="avancar" tamanho={14} /></>}
        <span aria-current="page">Gravação</span>
      </nav>
      <div className="page-head proc-cabecalho">
        <span className="proc-avatar avatar-neutro" aria-hidden="true"><Icone nome="tela-video" tamanho={26} /></span>
        <div className="proc-titulo">
          <input
            className="titulo-editavel"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            onBlur={() => nome.trim() && nome !== g.nome && void atualizarGravacao(g.id, { nome: nome.trim() })}
            aria-label="Nome da gravação"
          />
          <p className="page-meta org-meta">Gravação de tela<span>{gravado ? formatarTempo(gravado) : '--:--'}</span><span>{contar(g.marcacoes.length, 'tela marcada', 'telas marcadas')}</span>{g.pop && <span>{noPop} no POP</span>}{emAberto && <span><b>{ROTULO_STATUS[g.status]}</b></span>}</p>
        </div>
        <div className="actions">
          {g.status === 'pronta' && (
            <Link href={`/app/gravacoes/nova?continuar=${g.id}`} className="btn" title="Grava mais uma parte, em sequência, sem perder nada do que já foi gravado"><span className="rec-dot" />Continuar gravando</Link>
          )}
          {g.pop && <Link href={`/app/pops/${g.pop.id}`} className="btn"><Icone nome="pop" tamanho={16} />Abrir POP</Link>}
          <div className="menu">
            <button className="btn btn-icon" aria-label="Mais ações" title="Mais ações" aria-haspopup="true" aria-expanded={menu} onClick={() => setMenu((x) => !x)} onBlur={(e) => { if (!e.currentTarget.parentElement?.contains(e.relatedTarget as Node)) setMenu(false); }}><Icone nome="mais-acoes" /></button>
            {menu && (
              <div className="menu-list" role="menu">
                <button type="button" role="menuitem" className="menu-perigo" disabled={excluindo} onClick={() => { setMenu(false); void excluirTudo(); }} onBlur={() => setMenu(false)} title="Apaga o vídeo e as telas marcadas para sempre (as telas que já estão no POP continuam lá)"><Icone nome="lixo" tamanho={16} />Excluir gravação</button>
              </div>
            )}
          </div>
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
      {g.pop && (telasNovas.length > 0 || levando === 'ok') && (
        <div className={`faixa-telas${levando === 'ok' ? ' feito' : ''}`} role="status">
          <span className="faixa-telas-icone"><Icone nome={levando === 'ok' ? 'check' : 'camera'} tamanho={20} /></span>
          {levando === 'ok'
            ? <span>As telas novas entraram no POP <b>{g.pop.nome}</b>, numa etapa nova no fim. Revise e organize lá.</span>
            : <span><b>{contar(telasNovas.length, 'tela nova', 'telas novas')}</b> ainda não {telasNovas.length === 1 ? 'está' : 'estão'} no POP {g.pop.nome}.</span>}
          {levando === 'ok'
            ? <Link href={`/app/pops/${g.pop.id}`} className="btn">Abrir POP</Link>
            : <button className="btn btn-primary" onClick={levarTelasAoPop} disabled={levando === 'enviando'}><Icone nome="seta-direita" tamanho={16} />{levando === 'enviando' ? 'Levando…' : `Levar ${contar(telasNovas.length, 'tela', 'telas')} para o POP`}</button>}
        </div>
      )}
      {(falhas || g.status === 'erro') && <div className="aviso erro">Parte dos arquivos não foi enviada (conexão instável). O que foi salvo está abaixo.</div>}

      <div className="grav-layout">
        <PlayerSegmentos segmentos={g.segmentos} irPara={irPara} marcacoes={g.marcacoes.map((m) => m.tempo_ms)} />
        <section className="grav-telas">
          <div className="grav-telas-topo">
            <h2>Telas para o POP</h2>
            {g.marcacoes.length > 0 && <span>{incluidas} de {g.marcacoes.length} incluídas</span>}
          </div>
          {g.marcacoes.length === 0 && <p className="notice">Nenhuma tela foi marcada nesta gravação.</p>}
          {g.marcacoes.map((m, i) => (
            <CartaoTela key={m.id} m={m} n={i + 1} gravacaoId={g.id} noPop={g.pop?.telas.includes(m.id)} aoIr={() => setIrPara({ ms: m.tempo_ms, n: Date.now() })} aoExcluir={() => remover(m)}
              aoIncluir={(v) => setG((x) => x && { ...x, marcacoes: x.marcacoes.map((y) => (y.id === m.id ? { ...y, incluir_no_pop: v } : y)) })} />
          ))}
        </section>
      </div>

    </div>
  );
}

export default function GravacaoPage() {
  return <Suspense><Detalhe /></Suspense>;
}
