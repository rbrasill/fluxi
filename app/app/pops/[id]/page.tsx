'use client';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { Icone } from '@/components/Icone';
import { avisar, confirmar } from '@/components/Dialogos';
import { AnexarPrint } from '@/components/pop/AnexarPrint';
import { MoverPop } from '@/components/pop/MoverPop';
import { listar as listarFluxogramas, type FluxogramaResumo } from '@/lib/fluxogramas';
import type { ConteudoPop, Historico, Passo, Posicao } from '@/lib/pop/schema';
import { imagemColada, imagemParaPng, type Print } from '@/lib/gravacao/captura';
import { salvarMarcacaoDesenhada, type DonoTela } from '@/lib/gravacoes';
import { SeloStatus } from '@/components/SeloStatus';
import { anexarPrint, excluirTelaDoPop, obterPop, salvarPop, urlDocx, urlPdf, type Pop, type StatusPop, type TelaDoPop } from '@/lib/pops';
import { listarProcessos, type ProcessoResumo } from '@/lib/processos';

const EditorMarcacao = dynamic(() => import('@/components/marcacao/EditorMarcacao'), { ssr: false });

type Status = 'salvo' | 'alterado' | 'salvando' | 'erro';

const donoDe = (t: TelaDoPop): DonoTela => (t.pop_id ? { pop_id: t.pop_id } : { gravacao_id: t.gravacao_id! });

function mover<T>(lista: T[], de: number, para: number) {
  if (para < 0 || para >= lista.length) return lista;
  const nova = [...lista];
  const [item] = nova.splice(de, 1);
  nova.splice(para, 0, item);
  return nova;
}

function EditorPop() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  // ?retomar=1 (links "Continuar"): vai direto para onde a pessoa parou.
  const retomar = !!useSearchParams().get('retomar');
  const [pop, setPop] = useState<Pop | null | undefined>(undefined);
  const [status, setStatus] = useState<Status>('salvo');
  const [fluxogramas, setFluxogramas] = useState<FluxogramaResumo[]>([]);
  const [processos, setProcessos] = useState<ProcessoResumo[] | null>(null);
  // Tela sendo marcada: a marcação é da tela, então aparece igual na gravação e em todo POP que usa a tela.
  const [marcando, setMarcando] = useState<{ marcacaoId: string; caminho: string; titulo: string } | null>(null);
  // Passo recebendo um print (capturado, colado ou de arquivo).
  const [anexando, setAnexando] = useState<{ i: number; k: number } | null>(null);
  const [destaque, setDestaque] = useState<string | null>(null); // campo em que a pessoa parou, ao retomar
  const [chipOculto, setChipOculto] = useState(false);
  const [movendo, setMovendo] = useState(false);
  const pendente = useRef<Partial<Pop>>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Onde a pessoa está editando; vai para o banco para retomar depois, sem passar pelo autosave do conteúdo.
  const posicao = useRef<Posicao | null>(null);
  const posicaoSalva = useRef('');
  const timerPos = useRef<ReturnType<typeof setTimeout> | null>(null);
  const restaurado = useRef(false);

  useEffect(() => {
    obterPop(id).then((d) => {
      setPop(d);
      posicaoSalva.current = JSON.stringify(d.posicao);
      // POP sem processo: carrega a lista para poder vinculá-lo.
      if (!d.processo_id) listarProcessos().then(setProcessos).catch(() => setProcessos([]));
    }).catch(() => setPop(null));
    listarFluxogramas().then(setFluxogramas).catch(() => {});
  }, [id]);

  const salvarPosicao = useCallback((keepalive = false) => {
    const p = posicao.current;
    if (!p) return;
    const j = JSON.stringify(p);
    if (j === posicaoSalva.current) return;
    posicaoSalva.current = j;
    salvarPop(id, { posicao: p }, keepalive).catch(() => { posicaoSalva.current = ''; });
  }, [id]);

  // Cada campo fica dentro de um elemento com data-pos; o foco diz onde a pessoa está.
  function aoFocar(e: React.FocusEvent) {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-pos]');
    if (!el?.dataset.pos) return;
    posicao.current = { chave: el.dataset.pos, rotulo: (el.dataset.rotulo ?? '').slice(0, 120) };
    if (timerPos.current) clearTimeout(timerPos.current);
    timerPos.current = setTimeout(() => salvarPosicao(), 2000);
  }

  useEffect(() => {
    const aoSair = () => salvarPosicao(true);
    window.addEventListener('pagehide', aoSair);
    return () => { window.removeEventListener('pagehide', aoSair); salvarPosicao(true); };
  }, [salvarPosicao]);

  const irParaPosicao = useCallback((p: Posicao) => {
    const el = document.getElementById(`pos-${p.chave}`);
    if (!el) return;
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    (el.querySelector('textarea, input:not([readonly])') as HTMLElement | null)?.focus({ preventScroll: true });
    setDestaque(p.chave);
    setChipOculto(true);
    setTimeout(() => setDestaque(null), 3000);
  }, []);

  useEffect(() => {
    if (!pop?.posicao || !retomar || restaurado.current) return;
    restaurado.current = true;
    const t = setTimeout(() => irParaPosicao(pop.posicao!), 150);
    return () => clearTimeout(t);
  }, [pop, retomar, irParaPosicao]);

  const enviar = useCallback(async () => {
    const dados = pendente.current;
    pendente.current = {};
    if (!Object.keys(dados).length) return;
    setStatus('salvando');
    try {
      await salvarPop(id, dados);
      setStatus(Object.keys(pendente.current).length ? 'alterado' : 'salvo');
    } catch {
      pendente.current = { ...dados, ...pendente.current };
      setStatus('erro');
    }
  }, [id]);

  // Salva automaticamente 1 s depois da última alteração.
  const alterar = useCallback((dados: Partial<Pop>) => {
    setPop((p) => (p ? { ...p, ...dados } : p));
    pendente.current = { ...pendente.current, ...dados };
    setStatus('alterado');
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(enviar, 1000);
  }, [enviar]);

  useEffect(() => {
    const aviso = (e: BeforeUnloadEvent) => { if (Object.keys(pendente.current).length) e.preventDefault(); };
    window.addEventListener('beforeunload', aviso);
    return () => window.removeEventListener('beforeunload', aviso);
  }, []);

  if (pop === undefined) return <div className="page"><p className="notice">Carregando…</p></div>;
  if (pop === null) return <div className="page"><div className="empty"><h2>POP não encontrado</h2><Link className="btn btn-primary" href="/app/pops">Voltar</Link></div></div>;

  const c = pop.conteudo;
  const setConteudo = (novo: Partial<ConteudoPop>) => alterar({ conteudo: { ...c, ...novo } });
  const setProc = (i: number, novo: Partial<ConteudoPop['procedimentos'][number]>) =>
    setConteudo({ procedimentos: c.procedimentos.map((p, j) => (j === i ? { ...p, ...novo } : p)) });
  const setPasso = (i: number, k: number, novo: Partial<Passo>) =>
    setProc(i, { passos: c.procedimentos[i].passos.map((s, j) => (j === k ? { ...s, ...novo } : s)) });
  const moverPassoPara = (i: number, k: number, destino: number) => {
    const passo = c.procedimentos[i].passos[k];
    setConteudo({
      procedimentos: c.procedimentos.map((p, j) =>
        j === i ? { ...p, passos: p.passos.filter((_, x) => x !== k) } : j === destino ? { ...p, passos: [...p.passos, passo] } : p),
    });
  };
  const setHist = (h: Historico[]) => alterar({ historico: h });

  async function baixar(formato: 'docx' | 'pdf') {
    if (timer.current) clearTimeout(timer.current);
    await enviar();
    window.location.href = formato === 'pdf' ? urlPdf(id) : urlDocx(id);
  }

  /** Salva tudo, guarda onde parou e volta ao processo. Retomar = "Continuar" no processo ou no Início. */
  async function pausarESair() {
    if (timer.current) clearTimeout(timer.current);
    await enviar();
    salvarPosicao();
    router.push(pop!.processo_id ? `/app/processos/${pop!.processo_id}` : '/app/pops');
  }

  /** Antes de mover: salva o que estiver pendente (a mudança de área regrava o campo "Área" no servidor). */
  async function abrirMover() {
    if (timer.current) clearTimeout(timer.current);
    await enviar();
    if (Object.keys(pendente.current).length) return avisar('Não foi possível salvar as alterações.', 'Tente de novo antes de mover o POP.');
    setMovendo(true);
  }

  async function aoMover() {
    setMovendo(false);
    setPop(await obterPop(id));
  }

  // O print vira uma tela do POP (não da gravação) e entra no passo; o anterior, se era do POP, é apagado.
  async function anexarAoPasso(i: number, k: number, p: Print) {
    const anterior = c.procedimentos[i]?.passos[k];
    const tela = await anexarPrint(id, p.blob, p.largura, p.altura);
    setPop((prev) => prev && {
      ...prev,
      imagens: { ...prev.imagens, [tela.imagem_caminho]: tela.url },
      telas: { ...prev.telas, [tela.id]: { gravacao_id: null, pop_id: id, imagem_url: tela.url, largura: p.largura, altura: p.altura, anotacoes: null } },
    });
    setPasso(i, k, { imagem_caminho: tela.imagem_caminho, imagem_largura: p.largura, imagem_altura: p.altura, marcacao_id: tela.id });
    if (anterior?.marcacao_id && pop!.telas[anterior.marcacao_id]?.pop_id) void excluirTelaDoPop(id, anterior.marcacao_id).catch(() => {});
    setAnexando(null);
  }

  function removerImagem(i: number, k: number) {
    const s = c.procedimentos[i].passos[k];
    setPasso(i, k, { imagem_caminho: undefined, imagem_largura: undefined, imagem_altura: undefined, marcacao_id: undefined });
    if (s.marcacao_id && pop!.telas[s.marcacao_id]?.pop_id) void excluirTelaDoPop(id, s.marcacao_id).catch(() => {});
  }

  function passoComPrint(i: number) {
    const k = c.procedimentos[i].passos.length;
    setProc(i, { passos: [...c.procedimentos[i].passos, { texto: '' }] });
    setAnexando({ i, k });
  }

  // Ctrl+V com uma imagem copiada, estando num passo: o print entra nele.
  async function aoColar(e: React.ClipboardEvent) {
    const f = imagemColada(e.nativeEvent);
    const m = posicao.current?.chave.match(/^passo-(\d+)-(\d+)$/);
    if (!f || !m) return;
    const [i, k] = [Number(m[1]), Number(m[2])];
    const s = c.procedimentos[i]?.passos[k];
    if (!s) return;
    e.preventDefault();
    if (s.imagem_caminho && !(await confirmar({ titulo: 'Substituir o print deste passo?', mensagem: 'O passo já tem um print. Ele será trocado pelo que foi colado.', acao: 'Substituir' }))) return;
    imagemParaPng(f).then((p) => anexarAoPasso(i, k, p)).catch(() => avisar('Não foi possível colar a imagem.', 'Copie o print de novo ou use “Anexar print”.'));
  }

  function mudarStatus(novo: StatusPop) {
    alterar({ status: novo });
  }

  function vincularProcesso(processoId: string) {
    const pr = processos?.find((x) => x.id === processoId);
    if (!pr) return;
    alterar({ processo_id: pr.id });
    setPop((p) => p && { ...p, processo: { id: pr.id, nome: pr.nome, area: pr.area } });
  }

  // Fluxogramas do mesmo processo (e o que já estiver vinculado).
  const fluxosDoProcesso = fluxogramas.filter((f) => !pop.processo_id || f.processo_id === pop.processo_id || f.id === pop.fluxograma_id);
  const onde = pop.processo;

  const textoStatus = { salvo: 'Tudo salvo', alterado: 'Alterações não salvas', salvando: 'Salvando…', erro: 'Erro ao salvar. Tentando de novo ao editar.' }[status];

  const chipRetomar = pop.posicao && !chipOculto && !retomar && pop.status === 'rascunho';

  return (
    <div className="page page-pop" onFocusCapture={aoFocar} onPaste={aoColar}>
      <div className="page-head">
        <div>
          {onde ? (
            <nav className="migalha" aria-label="Caminho">
              {onde.area?.organizacao && <><Link href={`/app/organizacoes/${onde.area.organizacao.id}`}>{onde.area.organizacao.nome}</Link><span>›</span></>}
              {onde.area && <><Link href={`/app/areas/${onde.area.id}`}>{onde.area.nome}</Link><span>›</span></>}
              <Link href={`/app/processos/${onde.id}`}>{onde.nome}</Link>
            </nav>
          ) : (
            <div className="migalha sem-processo">
              <Link href="/app/pops">POPs</Link><span>›</span>
              <select value="" onChange={(e) => vincularProcesso(e.target.value)} aria-label="Vincular a um processo" disabled={processos === null}>
                <option value="">Sem processo · vincular a um processo…</option>
                {(processos ?? []).map((pr) => <option key={pr.id} value={pr.id}>{[pr.area?.organizacao?.nome, pr.area?.nome, pr.nome].filter(Boolean).join(' · ')}</option>)}
              </select>
            </div>
          )}
          <input className="titulo-editavel" value={pop.nome} onChange={(e) => alterar({ nome: e.target.value })} aria-label="Nome do procedimento" />
          <p className="status-linha">
            <SeloStatus status={pop.status} />
            <span className={`dot ${status === 'salvo' ? '' : status === 'erro' ? 'error' : 'saving'}`} />{textoStatus}
            {chipRetomar && (
              <button type="button" className="chip-retomar" onClick={() => irParaPosicao(pop.posicao!)} title="Ir para o ponto em que você parou">
                Você parou em: {pop.posicao!.rotulo} · Ir para lá
              </button>
            )}
          </p>
        </div>
        <div className="actions">
          {pop.status === 'publicado'
            ? <button className="btn btn-ghost" onClick={() => mudarStatus('rascunho')} title="Volta a ser rascunho, em elaboração">Voltar para rascunho</button>
            : <>
                <button className="btn btn-ghost" onClick={pausarESair} title="Salva tudo e guarda onde você parou, para continuar depois"><Icone nome="pausa" tamanho={16} />Pausar e sair</button>
                <button className="btn" onClick={() => mudarStatus('publicado')} title="Marca o POP como vigente"><Icone nome="check" tamanho={16} />Publicar</button>
              </>}
          <button className="btn btn-ghost" onClick={abrirMover} title="Leva o POP (com o processo dele) para outra área"><Icone nome="mover" tamanho={16} />Mover</button>
          <button className="btn" onClick={() => baixar('docx')}><Icone nome="baixar" tamanho={16} />DOCX</button>
          <button className="btn btn-primary" onClick={() => baixar('pdf')}><Icone nome="baixar" tamanho={16} />Baixar PDF</button>
        </div>
      </div>

      <section className="cartao pop-sec" id="pos-cabecalho" data-pos="cabecalho" data-rotulo="Dados do procedimento">
        <h2>Procedimento</h2>
        <div className="grade-3">
          <label className="field">Área<input value={c.area} onChange={(e) => setConteudo({ area: e.target.value })} placeholder="Área responsável" /></label>
          <label className="field">Identificação POP<input value={pop.identificacao} onChange={(e) => alterar({ identificacao: e.target.value.toUpperCase() })} placeholder="Sigla da área + número (XXXX-001)" /></label>
          <label className="field">Versão<input value={pop.versao} onChange={(e) => alterar({ versao: e.target.value })} /></label>
          <label className="field">Código do processo<input value={pop.codigo} readOnly className="somente-leitura" /></label>
          <label className="field">Data de criação<input value={new Date(pop.criado_em).toLocaleDateString('pt-BR')} readOnly className="somente-leitura" /></label>
          <label className="field">Executor do processo<input value={c.executor} onChange={(e) => setConteudo({ executor: e.target.value })} placeholder="Cargo de quem executa" /></label>
          <label className="field">Elaborado por<input value={pop.autor} onChange={(e) => alterar({ autor: e.target.value })} placeholder="Quem elaborou o POP" /></label>
        </div>
      </section>

      <section className={`cartao pop-sec ${destaque === 'objetivo' ? 'retomado' : ''}`} id="pos-objetivo" data-pos="objetivo" data-rotulo="Objetivo do processo">
        <h2>Objetivo do processo</h2>
        <textarea rows={3} value={c.objetivo} onChange={(e) => setConteudo({ objetivo: e.target.value })} placeholder="Para que serve este procedimento e qual resultado ele garante." />
      </section>

      <section className={`cartao pop-sec ${destaque === 'envolvidos' ? 'retomado' : ''}`} id="pos-envolvidos" data-pos="envolvidos" data-rotulo="Envolvidos">
        <h2>Envolvidos</h2>
        {c.envolvidos.map((e, i) => (
          <div key={i} className="linha-par">
            <span className="num">{i + 1}</span>
            <input value={e.area} onChange={(ev) => setConteudo({ envolvidos: c.envolvidos.map((x, j) => (j === i ? { ...x, area: ev.target.value } : x)) })} placeholder="Área" aria-label="Área" />
            <input value={e.cargo} onChange={(ev) => setConteudo({ envolvidos: c.envolvidos.map((x, j) => (j === i ? { ...x, cargo: ev.target.value } : x)) })} placeholder="Cargo" aria-label="Cargo" />
            <button className="btn btn-ghost btn-icon" aria-label="Remover" onClick={() => setConteudo({ envolvidos: c.envolvidos.filter((_, j) => j !== i) })}><Icone nome="lixo" tamanho={16} /></button>
          </div>
        ))}
        <button className="btn btn-tracejado" onClick={() => setConteudo({ envolvidos: [...c.envolvidos, { area: '', cargo: '' }] })}><Icone nome="mais" tamanho={16} />Adicionar área · cargo</button>
      </section>

      <section className="cartao pop-sec" id="pos-recursos" data-pos="recursos" data-rotulo="Recursos do processo">
        <h2>Recursos do processo</h2>
        <label className="field">
          Fluxograma
          <select value={pop.fluxograma_id ?? ''} onChange={(e) => alterar({ fluxograma_id: e.target.value || null })}>
            <option value="">{fluxosDoProcesso.length ? 'Nenhum' : 'Nenhum fluxograma neste processo'}</option>
            {fluxosDoProcesso.map((f) => <option key={f.id} value={f.id}>{f.nome} ({f.codigo})</option>)}
          </select>
        </label>
        {pop.fluxograma_id
          ? <Link href={`/app/fluxogramas/${pop.fluxograma_id}`} className="link-sec">Abrir diagrama</Link>
          : onde && <Link href={`/app/processos/${onde.id}`} className="link-sec">Criar o fluxograma no processo</Link>}
      </section>

      <section className="pop-sec">
        <h2 className="titulo-solto">Procedimentos</h2>
        {c.procedimentos.map((p, i) => (
          <div key={i} className={`cartao procedimento ${destaque === `proc-${i}` ? 'retomado' : ''}`} id={`pos-proc-${i}`} data-pos={`proc-${i}`} data-rotulo={`Procedimento ${i + 1}${p.nome ? `: ${p.nome}` : ''}`}>
            <div className="proc-topo">
              <span className="num">{i + 1}</span>
              <input className="proc-nome" value={p.nome} onChange={(e) => setProc(i, { nome: e.target.value })} placeholder="Nome do procedimento" aria-label="Nome do procedimento" />
              <button className="btn btn-ghost btn-icon" aria-label="Subir procedimento" disabled={i === 0} onClick={() => setConteudo({ procedimentos: mover(c.procedimentos, i, i - 1) })}>↑</button>
              <button className="btn btn-ghost btn-icon" aria-label="Descer procedimento" disabled={i === c.procedimentos.length - 1} onClick={() => setConteudo({ procedimentos: mover(c.procedimentos, i, i + 1) })}>↓</button>
              <button className="btn btn-ghost btn-icon" aria-label="Excluir procedimento" onClick={async () => (await confirmar({ titulo: 'Excluir este procedimento?', mensagem: 'Os passos dele também saem do POP.', acao: 'Excluir', perigo: true })) && setConteudo({ procedimentos: c.procedimentos.filter((_, j) => j !== i) })}><Icone nome="lixo" tamanho={16} /></button>
            </div>
            {p.passos.map((s, k) => (
              <div key={k} className={`passo ${destaque === `passo-${i}-${k}` ? 'retomado' : ''}`} id={`pos-passo-${i}-${k}`} data-pos={`passo-${i}-${k}`} data-rotulo={`Passo ${k + 1} do procedimento ${i + 1}`}>
                <span className="passo-num">{k + 1}</span>
                <div className="passo-corpo">
                  <textarea rows={2} value={s.texto} onChange={(e) => setPasso(i, k, { texto: e.target.value })} placeholder="Descreva o passo: o que fazer e onde clicar." />
                  {s.imagem_caminho ? (
                    <div className="passo-img">
                      {pop.imagens[s.imagem_caminho] ? <img src={pop.imagens[s.imagem_caminho]} alt={`Tela do passo ${k + 1}`} /> : <span className="notice">Imagem da gravação</span>}
                      <span className="passo-img-acoes">
                        {s.marcacao_id && pop.telas?.[s.marcacao_id]?.imagem_url && (
                          <button className="btn btn-ghost" onClick={() => setMarcando({ marcacaoId: s.marcacao_id!, caminho: s.imagem_caminho!, titulo: `Passo ${k + 1}` })}>
                            <Icone nome="marcar" tamanho={14} />Marcar tela
                          </button>
                        )}
                        <button className="btn btn-ghost" onClick={() => setAnexando({ i, k })} title="Captura, cola ou escolhe outro print para este passo"><Icone nome="camera" tamanho={14} />Trocar print</button>
                        <button className="btn btn-ghost" onClick={() => removerImagem(i, k)}>Remover imagem</button>
                      </span>
                    </div>
                  ) : (
                    <span className="passo-img-acoes">
                      <button className="btn btn-ghost" onClick={() => setAnexando({ i, k })} title="Captura a janela do sistema, cola um print ou escolhe um arquivo"><Icone nome="camera" tamanho={14} />Anexar print</button>
                    </span>
                  )}
                </div>
                <div className="passo-acoes">
                  <button className="btn btn-ghost btn-icon" aria-label="Subir passo" disabled={k === 0} onClick={() => setProc(i, { passos: mover(p.passos, k, k - 1) })}>↑</button>
                  <button className="btn btn-ghost btn-icon" aria-label="Descer passo" disabled={k === p.passos.length - 1} onClick={() => setProc(i, { passos: mover(p.passos, k, k + 1) })}>↓</button>
                  {c.procedimentos.length > 1 && (
                    <select aria-label="Mover para outro procedimento" value="" onChange={(e) => e.target.value !== '' && moverPassoPara(i, k, Number(e.target.value))}>
                      <option value="">Mover…</option>
                      {c.procedimentos.map((q, j) => j !== i && <option key={j} value={j}>{j + 1}. {q.nome || 'Sem nome'}</option>)}
                    </select>
                  )}
                  <button className="btn btn-ghost btn-icon" aria-label="Excluir passo" onClick={() => setProc(i, { passos: p.passos.filter((_, j) => j !== k) })}><Icone nome="lixo" tamanho={16} /></button>
                </div>
              </div>
            ))}
            <span className="passo-adicionar">
              <button className="btn btn-tracejado" onClick={() => setProc(i, { passos: [...p.passos, { texto: '' }] })}><Icone nome="mais" tamanho={16} />Adicionar passo</button>
              <button className="btn btn-tracejado" onClick={() => passoComPrint(i)} title="Cria um passo e já abre a captura do print"><Icone nome="camera" tamanho={16} />Adicionar passo com print</button>
            </span>
          </div>
        ))}
        <button className="btn" onClick={() => setConteudo({ procedimentos: [...c.procedimentos, { nome: '', passos: [{ texto: '' }] }] })}><Icone nome="mais" tamanho={16} />Adicionar procedimento</button>
      </section>

      <section className="cartao pop-sec" id="pos-historico" data-pos="historico" data-rotulo="Históricos de revisões">
        <h2>Históricos de revisões</h2>
        <div className="hist-cab"><span>Data</span><span>Elaborado por</span><span>Revisão</span><span /></div>
        {pop.historico.map((h, i) => (
          <div key={i} className="hist-linha">
            <input value={h.data} onChange={(e) => setHist(pop.historico.map((x, j) => (j === i ? { ...x, data: e.target.value } : x)))} aria-label="Data" />
            <input value={h.elaborado_por} onChange={(e) => setHist(pop.historico.map((x, j) => (j === i ? { ...x, elaborado_por: e.target.value } : x)))} placeholder="Nome" aria-label="Elaborado por" />
            <input value={h.revisao} onChange={(e) => setHist(pop.historico.map((x, j) => (j === i ? { ...x, revisao: e.target.value } : x)))} aria-label="Revisão" />
            <button className="btn btn-ghost btn-icon" aria-label="Remover" onClick={() => setHist(pop.historico.filter((_, j) => j !== i))}><Icone nome="lixo" tamanho={16} /></button>
          </div>
        ))}
        <button className="btn btn-tracejado" onClick={() => setHist([...pop.historico, { data: new Date().toLocaleDateString('pt-BR'), elaborado_por: pop.autor, revisao: `Rev. ${String(pop.historico.length + 1).padStart(2, '0')}` }])}><Icone nome="mais" tamanho={16} />Adicionar revisão</button>
      </section>

      {marcando && pop.telas[marcando.marcacaoId]?.imagem_url && (() => {
        const t = pop.telas[marcando.marcacaoId];
        return (
          <EditorMarcacao
            imagemUrl={t.imagem_url!}
            anotacoes={t.anotacoes}
            titulo={marcando.titulo}
            aoFechar={() => setMarcando(null)}
            aoSalvar={async (r) => {
              const url = await salvarMarcacaoDesenhada(donoDe(t), marcando.marcacaoId, r);
              setPop((p) => p && {
                ...p,
                imagens: { ...p.imagens, [marcando.caminho]: url ?? t.imagem_url! },
                telas: { ...p.telas, [marcando.marcacaoId]: { ...t, anotacoes: r?.anotacoes ?? null } },
              });
              setMarcando(null);
            }}
          />
        );
      })()}

      {anexando && c.procedimentos[anexando.i]?.passos[anexando.k] && (
        <AnexarPrint
          titulo={`Passo ${anexando.k + 1} do procedimento ${anexando.i + 1}`}
          aoFechar={() => setAnexando(null)}
          aoAnexar={(p) => anexarAoPasso(anexando.i, anexando.k, p)}
        />
      )}

      {movendo && <MoverPop pop={pop} aoMover={aoMover} aoFechar={() => setMovendo(false)} />}
    </div>
  );
}

export default function PaginaPop() {
  return <Suspense><EditorPop /></Suspense>;
}
