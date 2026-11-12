'use client';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { Icone } from '@/components/Icone';
import { avisar, confirmar } from '@/components/Dialogos';
import { FaixaArquivado } from '@/components/FaixaArquivado';
import { AnexarPrint } from '@/components/pop/AnexarPrint';
import { MelhorarComIa } from '@/components/pop/MelhorarComIa';
import { MoverCopiar } from '@/components/MoverCopiar';
import { PaginaPublica } from '@/components/pop/PaginaPublica';
import { ReferenciasContext } from '@/components/pop/Referencia';
import { ReferenciadoEm } from '@/components/publico/Referencias';
import { PosicaoPasso } from '@/components/pop/PosicaoPasso';
import { TextoRico } from '@/components/pop/TextoRico';
import type { ConteudoPop, Historico, Passo, Posicao } from '@/lib/pop/schema';
import { textoPuro } from '@/lib/pop/texto-rico';
import { imagemColada, imagemParaPng, type Print } from '@/lib/gravacao/captura';
import { salvarMarcacaoDesenhada, type DonoTela } from '@/lib/gravacoes';
import { SeloStatus } from '@/components/SeloStatus';
import { adicionarTelasDaGravacao, anexarPrint, arquivarPop, definirLinkPublico, excluirPop, excluirTelaDoPop, listarTelasDasGravacoes, obterPop, popArquivado, publicarPop, restaurarPop, salvarPop, urlPdf, urlPublica, type Pop, type TelaDoPop } from '@/lib/pops';
import { ROTULO_STATUS, formatarTempo, type StatusGravacao, type TelaDaGravacao } from '@/lib/gravacoes';
import { listarProcessos, obterProcesso, type ProcessoResumo } from '@/lib/processos';
import type { ResultadoBusca } from '@/lib/referencias';

const EditorMarcacao = dynamic(() => import('@/components/marcacao/EditorMarcacao'), { ssr: false });

type Status = 'salvo' | 'alterado' | 'salvando' | 'erro';

const donoDe = (t: TelaDoPop): DonoTela => (t.pop_id ? { pop_id: t.pop_id } : { gravacao_id: t.gravacao_id! });
// Gravação que ainda pode receber mais conteúdo (pausada ou não finalizada).
const EM_ABERTO: StatusGravacao[] = ['pausada', 'gravando', 'interrompida'];

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
  const [processos, setProcessos] = useState<ProcessoResumo[] | null>(null);
  // Tela sendo marcada: a marcação é da tela, então aparece igual na gravação e em todo POP que usa a tela.
  const [marcando, setMarcando] = useState<{ marcacaoId: string; caminho: string; titulo: string } | null>(null);
  // Passo recebendo um print (capturado, colado ou de arquivo).
  const [anexando, setAnexando] = useState<{ i: number; k: number } | null>(null);
  const [destaque, setDestaque] = useState<string | null>(null); // campo em que a pessoa parou, ao retomar, ou passo recém-movido
  const [chipOculto, setChipOculto] = useState(false);
  const [movendo, setMovendo] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [levando, setLevando] = useState(''); // id da gravação cujas telas estão sendo levadas aos passos
  const [publicando, setPublicando] = useState(false);
  const [mudouDesdePublicar, setMudouDesdePublicar] = useState(false); // editado nesta sessão depois de publicar
  const [copiado, setCopiado] = useState(false);
  const [alterandoLink, setAlterandoLink] = useState(false);
  const bloqueado = useRef(false); // arquivado: nada é salvo
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
    (el.querySelector('[contenteditable="true"], textarea, input:not([readonly])') as HTMLElement | null)?.focus({ preventScroll: true });
    setDestaque(p.chave);
    setChipOculto(true);
    setTimeout(() => setDestaque(null), 3000);
  }, []);

  // "Definir" na lista de POPs do processo (decisão 78) traz para cá com #identificacao: vai direto ao campo.
  const foiParaIdentificacao = useRef(false);
  useEffect(() => {
    if (!pop || foiParaIdentificacao.current || location.hash !== '#identificacao') return;
    foiParaIdentificacao.current = true;
    const t = setTimeout(() => { const el = document.getElementById('identificacao'); el?.scrollIntoView({ block: 'center' }); el?.focus(); }, 150);
    return () => clearTimeout(t);
  }, [pop]);

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

  useEffect(() => { bloqueado.current = !!pop && popArquivado(pop); }, [pop]);

  // Salva automaticamente 1 s depois da última alteração.
  const alterar = useCallback((dados: Partial<Pop>) => {
    if (bloqueado.current) return;
    setPop((p) => (p ? { ...p, ...dados } : p));
    setMudouDesdePublicar(true);
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

  if (pop === undefined) return <div className="page fundo-pop"><p className="notice">Carregando…</p></div>;
  if (pop === null) return <div className="page fundo-pop"><div className="empty"><h2>POP não encontrado</h2><Link className="btn btn-primary" href="/app/pops">Voltar</Link></div></div>;

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
  // Digitar a posição no número do passo: vai direto para lá, e a tela acompanha e destaca o passo.
  const moverPassoParaPosicao = (i: number, k: number, destino: number) => {
    setProc(i, { passos: mover(c.procedimentos[i].passos, k, destino) });
    setTimeout(() => {
      document.getElementById(`pos-passo-${i}-${destino}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      setDestaque(`passo-${i}-${destino}`);
      setTimeout(() => setDestaque((d) => (d === `passo-${i}-${destino}` ? null : d)), 3000);
    }, 50);
  };
  const setHist = (h: Historico[]) => alterar({ historico: h });

  // O POP só sai em PDF (decisão 79). Salva o que estiver pendente antes, para o PDF ter a última versão.
  async function baixarPdf() {
    if (timer.current) clearTimeout(timer.current);
    await enviar();
    window.location.href = urlPdf(id);
  }

  /** Salva tudo, guarda onde parou e volta ao processo. Retomar = "Continuar" no processo ou no Início. */
  async function pausarESair() {
    if (timer.current) clearTimeout(timer.current);
    await enviar();
    salvarPosicao();
    router.push(pop!.processo_id ? `/app/processos/${pop!.processo_id}` : '/app/pops');
  }

  /** Antes de mover ou copiar: salva o que estiver pendente (o servidor regrava o campo "Área" ao mover e copia o conteúdo salvo). */
  async function abrirMover() {
    if (timer.current) clearTimeout(timer.current);
    await enviar();
    if (Object.keys(pendente.current).length) return avisar('Não foi possível salvar as alterações.', 'Tente de novo antes de mover ou copiar o POP.');
    setMovendo(true);
  }

  /** Mover: recarrega o POP (código, processo e "Área" mudaram). Copiar: abre a cópia. */
  async function aoMoverOuCopiar({ acao, id: novo }: { acao: 'mover' | 'copiar'; id: string }) {
    setMovendo(false);
    if (acao === 'copiar') { router.push(`/app/pops/${novo}`); return; }
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

  // Uma tela marcada numa gravação do POP vira o print do passo (a tela continua sendo da gravação).
  function usarTelaDaGravacao(i: number, k: number, t: TelaDaGravacao) {
    const anterior = c.procedimentos[i]?.passos[k];
    setPop((prev) => prev && {
      ...prev,
      imagens: { ...prev.imagens, [t.imagem_caminho]: t.imagem_anotada_url ?? t.imagem_url ?? '' },
      telas: { ...prev.telas, [t.id]: { gravacao_id: t.gravacao_id, pop_id: null, imagem_url: t.imagem_url, largura: t.largura, altura: t.altura, anotacoes: t.anotacoes } },
    });
    setPasso(i, k, { imagem_caminho: t.imagem_caminho, imagem_largura: t.largura ?? undefined, imagem_altura: t.altura ?? undefined, marcacao_id: t.id });
    if (anterior?.marcacao_id && pop!.telas[anterior.marcacao_id]?.pop_id) void excluirTelaDoPop(id, anterior.marcacao_id).catch(() => {});
    setAnexando(null);
  }

  // As telas marcadas que ainda não estão nos passos entram num procedimento novo, no fim.
  async function levarTelas(gravacaoId: string) {
    if (timer.current) clearTimeout(timer.current);
    await enviar();
    if (Object.keys(pendente.current).length) return avisar('Não foi possível salvar as alterações.', 'Tente de novo antes de levar as telas.');
    setLevando(gravacaoId);
    try { await adicionarTelasDaGravacao(id, gravacaoId); setPop(await obterPop(id)); } catch { void avisar('Não foi possível levar as telas para o POP.', 'Tente de novo em instantes.'); } finally { setLevando(''); }
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

  // Publicar guarda a versão atual: a página pública mostra só ela até publicar de novo (decisão 32).
  async function publicar() {
    if (timer.current) clearTimeout(timer.current);
    await enviar();
    if (Object.keys(pendente.current).length) return avisar('Não foi possível salvar as alterações.', 'Tente de novo antes de publicar.');
    setPublicando(true);
    try {
      const r = await publicarPop(id);
      setPop((p) => p && { ...p, status: 'publicado', publicado_em: r.publicado_em, alteracoes_nao_publicadas: false });
      setMudouDesdePublicar(false);
    } catch (e) {
      void avisar('Não foi possível publicar o POP.', e instanceof Error ? e.message : 'Tente de novo em instantes.');
    } finally {
      setPublicando(false);
    }
  }

  // Chave da página pública (decisão 34): muda na hora; se o servidor recusar, volta como estava.
  async function alternarLink() {
    const ativo = !pop!.link_publico_ativo;
    setAlterandoLink(true);
    setPop((p) => p && { ...p, link_publico_ativo: ativo });
    try {
      await definirLinkPublico(id, ativo);
    } catch (e) {
      setPop((p) => p && { ...p, link_publico_ativo: !ativo });
      void avisar(ativo ? 'Não foi possível colocar a página pública no ar.' : 'Não foi possível tirar a página pública do ar.', e instanceof Error ? e.message : 'Tente de novo em instantes.');
    } finally {
      setAlterandoLink(false);
    }
  }

  async function copiarLink() {
    const url = urlPublica(pop!.link_publico);
    try {
      await navigator.clipboard.writeText(url);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    } catch {
      void avisar('Copie o link público do POP', url);
    }
  }

  // Arquivar em vez de excluir (decisão 31): só o POP arquivado pode ser excluído, com as gravações dele.
  async function arquivar() {
    if (timer.current) clearTimeout(timer.current);
    await enviar();
    if (!(await confirmar({ titulo: `Arquivar o POP "${pop!.nome}"?`, mensagem: `O POP some das listas e não pode ser editado. Nada é apagado: dá para restaurar depois.${citadoEm}`, acao: 'Arquivar' }))) return;
    setOcupado(true);
    try { await arquivarPop(id); setPop(await obterPop(id)); } catch { void avisar('Não foi possível arquivar o POP.', 'Tente de novo em instantes.'); } finally { setOcupado(false); }
  }

  async function restaurar() {
    setOcupado(true);
    try { await restaurarPop(id); setPop(await obterPop(id)); } catch { void avisar('Não foi possível restaurar o POP.', 'Tente de novo em instantes.'); } finally { setOcupado(false); }
  }

  async function excluirDefinitivo() {
    if (!(await confirmar({ titulo: `Excluir definitivamente o POP "${pop!.nome}"?`, mensagem: `Apaga o POP com as gravações dele. Essa ação não pode ser desfeita.${citadoEm ? `${citadoEm} As referências passam a apontar para um documento excluído.` : ''}`, acao: 'Excluir', perigo: true }))) return;
    setOcupado(true);
    try {
      await excluirPop(id);
      router.push(pop!.processo_id ? `/app/processos/${pop!.processo_id}` : '/app/pops');
    } catch (e) {
      setOcupado(false);
      void avisar('Não foi possível excluir o POP.', e instanceof Error ? e.message : 'Tente de novo em instantes.');
    }
  }

  function vincularProcesso(processoId: string) {
    const pr = processos?.find((x) => x.id === processoId);
    if (!pr) return;
    alterar({ processo_id: pr.id });
    setPop((p) => p && { ...p, processo: { id: pr.id, nome: pr.nome, arquivado_em: null, area: pr.area }, fluxograma: null });
    // O fluxograma passa a ser o do processo escolhido.
    obterProcesso(pr.id).then((x) => setPop((p) => p && p.processo_id === pr.id ? { ...p, fluxograma: x.fluxograma } : p)).catch(() => {});
  }

  const onde = pop.processo;
  const documento = { tipo: 'pop' as const, id };
  // Uma referência acabou de entrar no texto: o chip já mostra o nome; a situação vem do servidor na próxima carga.
  function registrarReferencia(r: ResultadoBusca) {
    const k = `${r.tipo}:${r.id}`;
    setPop((p) => p && !p.referencias[k] ? { ...p, referencias: { ...p.referencias, [k]: { tipo: r.tipo, id: r.id, nome: r.nome, identificacao: r.identificacao, codigo: r.codigo, rotulo: r.rotulo, situacao: r.situacao, publico: r.situacao === 'ok', url_app: `/app/${r.tipo === 'pop' ? 'pops' : 'processos'}/${r.id}`, url_publica: null } } } : p);
  }
  const citadoEm = pop.referenciado_em.length ? ` Atenção: este POP é referenciado em ${pop.referenciado_em.length} ${pop.referenciado_em.length === 1 ? 'documento' : 'documentos'}.` : '';
  // Ao sair do editor do fluxograma, volta para este POP.
  const editarFluxo = pop.fluxograma ? `/app/fluxogramas/${pop.fluxograma.id}?voltar=${encodeURIComponent(`/app/pops/${id}`)}` : '';

  const textoStatus = { salvo: 'Tudo salvo', alterado: 'Alterações não salvas', salvando: 'Salvando…', erro: 'Erro ao salvar. Tentando de novo ao editar.' }[status];

  const chipRetomar = pop.posicao && !chipOculto && !retomar && pop.status === 'rascunho';
  const arquivado = popArquivado(pop);
  const publicado = pop.status === 'publicado';
  const naoPublicadas = publicado && (pop.alteracoes_nao_publicadas || mudouDesdePublicar);
  // "Nesta página" (decisão 80): o índice das seções, com a marca de preenchido.
  const totalPassos = c.procedimentos.reduce((n, p) => n + p.passos.length, 0);
  const passosEscritos = c.procedimentos.reduce((n, p) => n + p.passos.filter((x) => textoPuro(x.texto) || x.imagem_caminho).length, 0);
  const indice: { alvo: string; nome: string; feito: boolean; conta?: string }[] = [
    { alvo: 'pos-cabecalho', nome: 'Identificação', feito: !!pop.identificacao.trim() },
    { alvo: 'pos-objetivo', nome: 'Objetivo', feito: !!textoPuro(c.objetivo) },
    { alvo: 'pos-envolvidos', nome: 'Envolvidos', feito: c.envolvidos.some((e) => e.area.trim() || e.cargo.trim()), conta: c.envolvidos.length ? String(c.envolvidos.length) : undefined },
    { alvo: 'pos-procedimentos', nome: 'Procedimentos', feito: passosEscritos > 0, conta: `${c.procedimentos.length} ${c.procedimentos.length === 1 ? 'etapa' : 'etapas'}` },
    { alvo: 'pos-historico', nome: 'Histórico de revisões', feito: pop.historico.length > 0, conta: pop.historico.length ? String(pop.historico.length) : undefined },
  ];

  return (
    <ReferenciasContext.Provider value={pop.referencias}>
    <div className="page fundo-pop pagina-pop" onFocusCapture={aoFocar} onPaste={aoColar}>
      {onde ? (
        <nav className="trilha" aria-label="Caminho">
          {onde.area?.organizacao && <><Link href={`/app/organizacoes/${onde.area.organizacao.id}`}>{onde.area.organizacao.nome}</Link><Icone nome="avancar" tamanho={14} /></>}
          {onde.area && <><Link href={`/app/areas/${onde.area.id}`}>{onde.area.nome}</Link><Icone nome="avancar" tamanho={14} /></>}
          <Link href={`/app/processos/${onde.id}#pops`}>{onde.nome}</Link><Icone nome="avancar" tamanho={14} />
          <span aria-current="page">POP{pop.identificacao ? ` ${pop.identificacao}` : ''}</span>
        </nav>
      ) : (
        <div className="trilha migalha sem-processo">
          <Link href="/app/pops">POPs</Link><Icone nome="avancar" tamanho={14} />
          <select value="" onChange={(e) => vincularProcesso(e.target.value)} aria-label="Vincular a um processo" disabled={processos === null}>
            <option value="">Sem processo · vincular a um processo…</option>
            {(processos ?? []).map((pr) => <option key={pr.id} value={pr.id}>{[pr.area?.organizacao?.nome, pr.area?.nome, pr.nome].filter(Boolean).join(' · ')}</option>)}
          </select>
        </div>
      )}

      <div className="page-head proc-cabecalho">
        <span className={`proc-avatar ${arquivado ? 'pi-arquivado' : publicado ? 'pi-publicado' : 'pi-rascunho'}`} aria-hidden="true"><Icone nome="pop" tamanho={26} /></span>
        <div className="proc-titulo">
          <input className="titulo-editavel" value={pop.nome} onChange={(e) => alterar({ nome: e.target.value })} aria-label="Nome do procedimento" readOnly={arquivado} />
          <p className="status-linha">
            <span className="chip-tipo">POP</span>
            <SeloStatus status={pop.status} offline={!pop.link_publico_ativo} />
            {publicado && pop.publicado_em && <span className="publicado-em">em {new Date(pop.publicado_em).toLocaleDateString('pt-BR')}</span>}
            {naoPublicadas && !arquivado && <span className="chip-nao-publicado" title="A página pública mostra a versão publicada; publique de novo para atualizá-la">Alterações não publicadas</span>}
            {!arquivado && (
              <span className={`salvo-auto ${status === 'salvo' ? 'ok' : status === 'erro' ? 'erro' : ''}`} role="status">
                {status === 'salvo' && <Icone nome="check" tamanho={15} />}{textoStatus}
              </span>
            )}
            {chipRetomar && (
              <button type="button" className="chip-retomar" onClick={() => irParaPosicao(pop.posicao!)} title="Ir para o ponto em que você parou">
                Você parou em: {pop.posicao!.rotulo} · Ir para lá
              </button>
            )}
          </p>
        </div>
        <div className="actions">
          {!arquivado && !publicado && <button className="btn" onClick={pausarESair} title="Salva tudo e guarda onde você parou, para continuar depois"><Icone nome="pausa" tamanho={16} />Pausar e sair</button>}
          {!arquivado && (!publicado || naoPublicadas) && (
            <button className={`btn ${naoPublicadas ? 'btn-destaque' : ''}`} onClick={publicar} disabled={publicando}
              title={publicado ? 'Atualiza a página pública com a versão atual' : 'Publica o POP: a página pública passa a mostrar esta versão'}>
              <Icone nome="check" tamanho={16} />{publicando ? 'Publicando…' : publicado ? 'Publicar alterações' : 'Publicar'}
            </button>
          )}
          {!arquivado && <button className="btn btn-icon" onClick={abrirMover} aria-label="Mover ou copiar" title="Mover para outro processo ou criar uma cópia"><Icone nome="mover" tamanho={16} /></button>}
          {!arquivado && <button className="btn btn-icon" onClick={arquivar} disabled={ocupado} aria-label="Arquivar POP" title="Arquivar: tira o POP das listas; dá para restaurar depois"><Icone nome="arquivar" tamanho={16} /></button>}
          <button className="btn btn-primary" onClick={() => void baixarPdf()}><Icone nome="baixar" tamanho={16} />Baixar PDF</button>
        </div>
      </div>

      {pop.arquivado_em && <FaixaArquivado tipo="POP" desde={pop.arquivado_em} aoRestaurar={restaurar} aoExcluir={excluirDefinitivo} ocupado={ocupado} />}
      {!pop.arquivado_em && pop.processo?.arquivado_em && (
        <div className="aviso arquivado" role="status">
          <Icone nome="arquivar" tamanho={18} />
          <span><b>O processo deste POP está arquivado.</b> Para editar, restaure o processo <Link href={`/app/processos/${pop.processo.id}`}>{pop.processo.nome}</Link>.</span>
        </div>
      )}

      <div className="proc-grade pop-grade">
      {/* Arquivado: tudo fica visível, mas nada responde (inert) nem é salvo. */}
      <div inert={arquivado} className={`pop-conteudo${arquivado ? ' bloqueado' : ''}`}>
      <section className="cartao pop-sec" id="pos-cabecalho" data-pos="cabecalho" data-rotulo="Identificação">
        <div className="sec-cabeca">
          <h2>Identificação</h2>
          <p>Dados de controle que vão no cabeçalho do PDF.</p>
        </div>
        <div className="grade-3">
          <label className="field">Identificação do POP<input id="identificacao" className="mono" value={pop.identificacao} onChange={(e) => alterar({ identificacao: e.target.value.toUpperCase() })} placeholder="Sigla da área + número (XXXX-001)" /></label>
          <label className="field">Versão<input value={pop.versao} onChange={(e) => alterar({ versao: e.target.value })} /></label>
          <label className="field">Área<input value={c.area} onChange={(e) => setConteudo({ area: e.target.value })} placeholder="Área responsável" /></label>
          <label className="field">Executor do processo<input value={c.executor} onChange={(e) => setConteudo({ executor: e.target.value })} placeholder="Cargo de quem executa" /></label>
          <label className="field">Elaborado por<input value={pop.autor} onChange={(e) => alterar({ autor: e.target.value })} placeholder="Quem elaborou o POP" /></label>
        </div>
        <p className="dados-automaticos">
          <span><Icone nome="cadeado" tamanho={14} />Preenchidos automaticamente</span>
          <span>Código do processo <b className="mono">{pop.codigo}</b></span>
          <span>Criado em <b>{new Date(pop.criado_em).toLocaleDateString('pt-BR')}</b></span>
        </p>
      </section>

      <section className={`cartao pop-sec ${destaque === 'objetivo' ? 'retomado' : ''}`} id="pos-objetivo" data-pos="objetivo" data-rotulo="Objetivo do POP">
        <div className="sec-titulo">
          <div className="sec-cabeca">
            <h2>Objetivo</h2>
            <p>Para que serve este procedimento operacional padrão.</p>
          </div>
          <MelhorarComIa variante="botao" rotulo="Objetivo do POP" vazio={!textoPuro(c.objetivo)}
            pedido={() => ({ campo: 'objetivo', texto: c.objetivo, pop: pop.nome })} aoAplicar={(v) => setConteudo({ objetivo: v })} />
        </div>
        <TextoRico valor={c.objetivo} aoMudar={(v) => setConteudo({ objetivo: v })} rotulo="Objetivo do POP" linhas={3} placeholder="Para que serve este procedimento e qual resultado ele garante." documento={documento} aoReferenciar={registrarReferencia} />
      </section>

      <section className={`cartao pop-sec ${destaque === 'envolvidos' ? 'retomado' : ''}`} id="pos-envolvidos" data-pos="envolvidos" data-rotulo="Envolvidos">
        <h2 className="titulo-com-conta">Envolvidos{c.envolvidos.length > 0 && <small>{c.envolvidos.length} {c.envolvidos.length === 1 ? 'área e cargo' : 'áreas e cargos'}</small>}</h2>
        {c.envolvidos.length > 0 && <div className="linha-par linha-par-cab" aria-hidden="true"><span /><span>Área</span><span>Cargo</span><span /></div>}
        {c.envolvidos.map((e, i) => (
          <div key={i} className="linha-par">
            <span className="num">{i + 1}</span>
            <input value={e.area} onChange={(ev) => setConteudo({ envolvidos: c.envolvidos.map((x, j) => (j === i ? { ...x, area: ev.target.value } : x)) })} placeholder="Área" aria-label="Área" />
            <input value={e.cargo} onChange={(ev) => setConteudo({ envolvidos: c.envolvidos.map((x, j) => (j === i ? { ...x, cargo: ev.target.value } : x)) })} placeholder="Cargo" aria-label="Cargo" />
            <button className="btn btn-ghost btn-icon btn-lixo" aria-label="Remover" title="Remover" onClick={() => setConteudo({ envolvidos: c.envolvidos.filter((_, j) => j !== i) })}><Icone nome="lixo" tamanho={16} /></button>
          </div>
        ))}
        <button className="btn btn-tracejado" onClick={() => setConteudo({ envolvidos: [...c.envolvidos, { area: '', cargo: '' }] })}><Icone nome="mais" tamanho={16} />Adicionar envolvido</button>
      </section>

      <section className="cartao pop-sec" id="pos-procedimentos">
        <div className="sec-titulo">
          <div className="sec-cabeca">
            <h2>Procedimentos</h2>
            <p>Etapas e passos, na ordem em que acontecem.</p>
          </div>
          <span className="sec-conta">{c.procedimentos.length} {c.procedimentos.length === 1 ? 'etapa' : 'etapas'} · {totalPassos} {totalPassos === 1 ? 'passo' : 'passos'}</span>
        </div>
        {c.procedimentos.map((p, i) => (
          <div key={i} className={`etapa ${destaque === `proc-${i}` ? 'retomado' : ''}`} id={`pos-proc-${i}`} data-pos={`proc-${i}`} data-rotulo={`Etapa ${i + 1}${p.nome ? `: ${p.nome}` : ''}`}>
            <div className="etapa-topo">
              <span className="chip-tipo">Etapa {i + 1}</span>
              <input className="proc-nome" value={p.nome} onChange={(e) => setProc(i, { nome: e.target.value })} placeholder="Nome da etapa" aria-label="Nome da etapa" />
              <button className="btn btn-ghost btn-icon" aria-label="Subir etapa" title="Subir etapa" disabled={i === 0} onClick={() => setConteudo({ procedimentos: mover(c.procedimentos, i, i - 1) })}><Icone nome="seta-cima" tamanho={16} /></button>
              <button className="btn btn-ghost btn-icon" aria-label="Descer etapa" title="Descer etapa" disabled={i === c.procedimentos.length - 1} onClick={() => setConteudo({ procedimentos: mover(c.procedimentos, i, i + 1) })}><Icone nome="seta-para-baixo" tamanho={16} /></button>
              <button className="btn btn-ghost btn-icon btn-lixo" aria-label="Excluir etapa" title="Excluir etapa" onClick={async () => (await confirmar({ titulo: 'Excluir esta etapa?', mensagem: 'Os passos dela também saem do POP.', acao: 'Excluir', perigo: true })) && setConteudo({ procedimentos: c.procedimentos.filter((_, j) => j !== i) })}><Icone nome="lixo" tamanho={16} /></button>
            </div>
            <div className="etapa-corpo">
            {p.passos.map((s, k) => (
              <div key={k} className={`passo ${destaque === `passo-${i}-${k}` ? 'retomado' : ''}`} id={`pos-passo-${i}-${k}`} data-pos={`passo-${i}-${k}`} data-rotulo={`Passo ${i + 1}.${k + 1}`}>
                <div className="passo-topo">
                  <span className="passo-rotulo">Passo {i + 1}.<PosicaoPasso numero={k + 1} total={p.passos.length} aoMover={(n) => moverPassoParaPosicao(i, k, n - 1)} /></span>
                  <div className="passo-acoes">
                    <MelhorarComIa rotulo={`Passo ${i + 1}.${k + 1}`} vazio={!textoPuro(s.texto)} aoAplicar={(v) => setPasso(i, k, { texto: v })}
                      pedido={() => ({ campo: 'passo', texto: s.texto, pop: pop.nome, procedimento: p.nome, numero: k + 1, anterior: p.passos[k - 1]?.texto, seguinte: p.passos[k + 1]?.texto })} />
                    <button className="btn btn-ghost btn-icon" aria-label="Subir passo" title="Subir passo" disabled={k === 0} onClick={() => setProc(i, { passos: mover(p.passos, k, k - 1) })}><Icone nome="seta-cima" tamanho={16} /></button>
                    <button className="btn btn-ghost btn-icon" aria-label="Descer passo" title="Descer passo" disabled={k === p.passos.length - 1} onClick={() => setProc(i, { passos: mover(p.passos, k, k + 1) })}><Icone nome="seta-para-baixo" tamanho={16} /></button>
                    {c.procedimentos.length > 1 && (
                      <select aria-label="Mover para outra etapa" value="" onChange={(e) => e.target.value !== '' && moverPassoPara(i, k, Number(e.target.value))}>
                        <option value="">Mover para…</option>
                        {c.procedimentos.map((q, j) => j !== i && <option key={j} value={j}>Etapa {j + 1}{q.nome ? `: ${q.nome}` : ''}</option>)}
                      </select>
                    )}
                    <button className="btn btn-ghost btn-icon btn-lixo" aria-label="Excluir passo" title="Excluir passo" onClick={() => setProc(i, { passos: p.passos.filter((_, j) => j !== k) })}><Icone nome="lixo" tamanho={16} /></button>
                  </div>
                </div>
                <div className="passo-corpo">
                  <TextoRico valor={s.texto} aoMudar={(v) => setPasso(i, k, { texto: v })} rotulo={`Passo ${i + 1}.${k + 1}`} placeholder="Descreva o passo: o que fazer e onde clicar." documento={documento} aoReferenciar={registrarReferencia} />
                  {s.imagem_caminho ? (
                    <div className="passo-img">
                      {pop.imagens[s.imagem_caminho] ? <img src={pop.imagens[s.imagem_caminho]} alt={`Tela do passo ${i + 1}.${k + 1}`} /> : <span className="notice">Imagem da gravação</span>}
                      <span className="passo-img-acoes">
                        {s.marcacao_id && pop.telas?.[s.marcacao_id]?.imagem_url && (
                          <button className="btn" onClick={() => setMarcando({ marcacaoId: s.marcacao_id!, caminho: s.imagem_caminho!, titulo: `Passo ${i + 1}.${k + 1}` })}>
                            <Icone nome="marcar" tamanho={15} />Marcar tela
                          </button>
                        )}
                        <button className="btn btn-ghost" onClick={() => setAnexando({ i, k })} title="Captura, cola ou escolhe outro print para este passo"><Icone nome="camera" tamanho={15} />Trocar print</button>
                        <button className="btn btn-ghost btn-excluir" onClick={() => removerImagem(i, k)}><Icone nome="lixo" tamanho={15} />Remover imagem</button>
                      </span>
                    </div>
                  ) : (
                    <span className="passo-img-acoes sem-imagem">
                      <button className="btn btn-ghost" onClick={() => setAnexando({ i, k })} title="Captura a janela do sistema, cola um print ou escolhe um arquivo"><Icone nome="camera" tamanho={15} />Anexar print</button>
                    </span>
                  )}
                </div>
              </div>
            ))}
            <span className="passo-adicionar">
              <button className="link-acao" onClick={() => setProc(i, { passos: [...p.passos, { texto: '' }] })}><Icone nome="mais" tamanho={16} />Adicionar passo</button>
              <button className="link-acao" onClick={() => passoComPrint(i)} title="Cria um passo e já abre a captura do print"><Icone nome="camera" tamanho={16} />Adicionar passo com print</button>
            </span>
            </div>
          </div>
        ))}
        <button className="btn btn-adicionar-proc" onClick={() => setConteudo({ procedimentos: [...c.procedimentos, { nome: '', passos: [{ texto: '' }] }] })}><Icone nome="mais" tamanho={16} />Adicionar etapa</button>
      </section>

      {onde && (
        <section className="cartao pop-sec" id="pos-fluxograma" aria-labelledby="titulo-fluxograma">
          <h2 id="titulo-fluxograma">Fluxograma do processo</h2>
          {pop.fluxograma ? (
            <div className="fluxo-do-pop">
              <Link href={editarFluxo} className="fluxo-previa" aria-label="Editar fluxograma" title="Editar fluxograma">
                {pop.fluxograma.miniatura
                  ? <img className="fluxo-miniatura" src={pop.fluxograma.miniatura} alt="" />
                  : <span className="pop-icone fluxo-icone"><Icone nome="fluxo" tamanho={22} /></span>}
              </Link>
              <div className="fluxo-info">
                <strong>{pop.fluxograma.nome}</strong>
                <span>{pop.fluxograma.origem === 'ia' ? 'Gerado com IA' : 'Desenhado à mão'} · atualizado em {new Date(pop.fluxograma.atualizado_em).toLocaleDateString('pt-BR')}</span>
                <span>
                  {pop.fluxograma.tem_svg
                    ? 'Aparece na página pública deste POP e vai no PDF como o link "Abrir diagrama".'
                    : 'Vai no PDF como o link "Abrir diagrama". Para aparecer também na página pública, abra o fluxograma uma vez.'}
                  {' '}É do processo: o que você mudar nele vale para todos os POPs do processo.
                </span>
              </div>
              <Link href={editarFluxo} className="btn" title="Abre o editor: mude o desenho, os textos e as setas; salva sozinho"><Icone nome="marcar" tamanho={16} />Editar fluxograma</Link>
            </div>
          ) : (
            <p className="notice">
              O processo <strong>{onde.nome}</strong> ainda não tem fluxograma. Ele é desenhado ou gerado com IA na <Link href={`/app/processos/${onde.id}`}>página do processo</Link> e, depois, aparece aqui, na página pública e no PDF.
            </p>
          )}
        </section>
      )}

      {pop.referenciado_em.length > 0 && (
        <section className="cartao pop-sec" id="pos-referenciado" aria-labelledby="titulo-referenciado">
          <h2 id="titulo-referenciado">Referenciado em</h2>
          <ReferenciadoEm itens={pop.referenciado_em} href={(x) => x.url_app || null} aviso="Estes documentos citam este POP. Na página pública deles, a referência leva à página pública deste POP." />
        </section>
      )}

      <section className="cartao pop-sec" id="pos-historico" data-pos="historico" data-rotulo="Histórico de revisões">
        <h2>Histórico de revisões</h2>
        {pop.historico.length > 0 && <div className="hist-cab"><span>Data</span><span>Elaborado por</span><span>Revisão</span><span /></div>}
        {pop.historico.map((h, i) => (
          <div key={i} className="hist-linha">
            <input value={h.data} onChange={(e) => setHist(pop.historico.map((x, j) => (j === i ? { ...x, data: e.target.value } : x)))} aria-label="Data" />
            <input value={h.elaborado_por} onChange={(e) => setHist(pop.historico.map((x, j) => (j === i ? { ...x, elaborado_por: e.target.value } : x)))} placeholder="Nome" aria-label="Elaborado por" />
            <input value={h.revisao} onChange={(e) => setHist(pop.historico.map((x, j) => (j === i ? { ...x, revisao: e.target.value } : x)))} aria-label="Revisão" />
            <button className="btn btn-ghost btn-icon btn-lixo" aria-label="Remover" title="Remover" onClick={() => setHist(pop.historico.filter((_, j) => j !== i))}><Icone nome="lixo" tamanho={16} /></button>
          </div>
        ))}
        <button className="btn btn-tracejado" onClick={() => setHist([...pop.historico, { data: new Date().toLocaleDateString('pt-BR'), elaborado_por: pop.autor, revisao: `Rev. ${String(pop.historico.length + 1).padStart(2, '0')}` }])}><Icone nome="mais" tamanho={16} />Adicionar revisão</button>
      </section>
      </div>

      <aside className="proc-coluna pop-lateral" aria-label="Página pública, índice e gravações">
        <PaginaPublica
          variante="cartao"
          estado={arquivado ? 'arquivado' : !publicado ? 'rascunho' : pop.link_publico_ativo ? 'online' : 'offline'}
          publicadoEm={pop.publicado_em}
          alteracoesNaoPublicadas={naoPublicadas}
          url={`/p/${pop.link_publico}`}
          alterando={alterandoLink}
          copiado={copiado}
          aoAlternar={alternarLink}
          aoCopiar={copiarLink}
        />

        <nav className="cartao cartao-lateral" aria-labelledby="titulo-nesta-pagina">
          <h3 id="titulo-nesta-pagina">Nesta página</h3>
          <ul className="nesta-pagina">
            {indice.map((x) => (
              <li key={x.alvo}>
                <button type="button" onClick={() => document.getElementById(x.alvo)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>
                  <span className={`indice-marca${x.feito ? ' feito' : ''}`} title={x.feito ? 'Preenchido' : 'Ainda vazio'}>{x.feito && <Icone nome="check" tamanho={13} />}</span>
                  <span className="indice-nome">{x.nome}</span>
                  {x.conta && <small>{x.conta}</small>}
                </button>
              </li>
            ))}
          </ul>
        </nav>

        <section className={`cartao cartao-lateral ${destaque === 'gravacoes' ? 'retomado' : ''}`} id="pos-gravacoes" data-pos="gravacoes" data-rotulo="Gravações de tela" inert={arquivado}>
          <div className="lateral-topo">
            <h3 className="titulo-com-conta">Gravações de tela{pop.gravacoes.length > 0 && <small>{pop.gravacoes.length}</small>}</h3>
            <Link href={`/app/gravacoes/nova?pop=${id}`} className="btn btn-gravar-tela"><span className="rec-dot" />Gravar tela</Link>
          </div>
          {pop.gravacoes.length === 0
            ? <p className="lateral-texto">Grave a execução no sistema narrando cada passo e marque as telas importantes: elas ficam disponíveis como print dos passos.</p>
            : (
              <ul className="gravacoes-lista">
                {pop.gravacoes.map((g) => (
                  <li key={g.id}>
                    <div className="gravacao-linha">
                      <span className="gravacao-icone"><Icone nome="play" tamanho={14} /></span>
                      <Link href={`/app/gravacoes/${g.id}`} className="gravacao-texto">
                        <strong>{g.nome}</strong>
                        <small>{g.duracao_ms ? formatarTempo(g.duracao_ms) : '--:--'} · {g.total_marcacoes} {g.total_marcacoes === 1 ? 'tela marcada' : 'telas marcadas'}{EM_ABERTO.includes(g.status) ? ` · ${ROTULO_STATUS[g.status].toLowerCase()}` : ''}</small>
                      </Link>
                      {EM_ABERTO.includes(g.status)
                        ? <Link href={`/app/gravacoes/nova?continuar=${g.id}`} className="link-acao">Continuar</Link>
                        : <Link href={`/app/gravacoes/${g.id}`} className="link-acao">Abrir</Link>}
                    </div>
                    {g.telas_novas > 0 && (
                      <button type="button" className="btn btn-largo" onClick={() => void levarTelas(g.id)} disabled={levando === g.id} title="As telas marcadas que ainda não estão nos passos entram numa etapa nova, no fim">
                        <Icone nome="pop" tamanho={16} />{levando === g.id ? 'Levando…' : `Levar ${g.telas_novas} ${g.telas_novas === 1 ? 'tela' : 'telas'} para os passos`}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
        </section>
      </aside>
      </div>

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
              setMudouDesdePublicar(true); // a marcação muda o print que vai para a página pública
              setMarcando(null);
            }}
          />
        );
      })()}

      {anexando && c.procedimentos[anexando.i]?.passos[anexando.k] && (
        <AnexarPrint
          titulo={`Passo ${anexando.i + 1}.${anexando.k + 1}`}
          aoFechar={() => setAnexando(null)}
          aoAnexar={(p) => anexarAoPasso(anexando.i, anexando.k, p)}
          telasDaGravacao={pop.gravacoes.length ? () => listarTelasDasGravacoes(id) : undefined}
          aoEscolherTela={(t) => usarTelaDaGravacao(anexando.i, anexando.k, t)}
        />
      )}

      {movendo && <MoverCopiar item={{ tipo: 'pop', id: pop.id, nome: pop.nome, identificacao: pop.identificacao, processo: pop.processo }} aoConcluir={aoMoverOuCopiar} aoFechar={() => setMovendo(false)} />}
    </div>
    </ReferenciasContext.Provider>
  );
}

export default function PaginaPop() {
  return <Suspense><EditorPop /></Suspense>;
}
