'use client';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { Suspense, useEffect, useRef, useState } from 'react';
import { Icone } from '@/components/Icone';
import { avisar, confirmar } from '@/components/Dialogos';
import { DialogoNome } from '@/components/DialogoNome';
import { FaixaArquivado } from '@/components/FaixaArquivado';
import { MoverCopiar } from '@/components/MoverCopiar';
import { NovoFluxograma } from '@/components/NovoFluxograma';
import { EntrevistasDoProcesso } from '@/components/entrevista/EntrevistasDoProcesso';
import { SeloStatus } from '@/components/SeloStatus';
import { MelhorarComIa } from '@/components/pop/MelhorarComIa';
import { PaginaPublica } from '@/components/pop/PaginaPublica';
import { ReferenciasContext } from '@/components/pop/Referencia';
import { TextoRico } from '@/components/pop/TextoRico';
import { textoPuro } from '@/lib/pop/texto-rico';
import { ReferenciadoEm } from '@/components/publico/Referencias';
import type { ResultadoBusca } from '@/lib/referencias';
import { criarPop, restaurarPop, type StatusPop } from '@/lib/pops';
import { ehGestor, useEu } from '@/lib/auth/eu';
import { corDoAvatar, iniciais } from '@/lib/iniciais';
import { listarAreas, porOrganizacao, type AreaResumo } from '@/lib/areas';
import { arquivarProcesso, atualizarProcesso, definirLinkPublicoProcesso, excluirProcesso, obterProcesso, restaurarProcesso, type Processo } from '@/lib/processos';

// Página do processo (decisão 31, redesenhada na decisão 77): a visão geral traz o fluxograma (um por processo) e a
// descrição, com o resumo, a página pública e as entrevistas ao lado; os POPs e as entrevistas com a
// Maia têm cada um a sua aba. Gravações ficam dentro de cada POP.

const data = (iso: string) => new Date(iso).toLocaleDateString('pt-BR');

// As abas da página (redesign, decisão 77). A aba fica no endereço (#pops, #entrevistas) para o link levar direto a ela.
type Aba = 'visao' | 'pops' | 'entrevistas';
const ABAS: { id: Aba; rotulo: string }[] = [{ id: 'visao', rotulo: 'Visão geral' }, { id: 'pops', rotulo: 'POPs' }, { id: 'entrevistas', rotulo: 'Entrevistas' }];
const abaDoEndereco = (): Aba => {
  const h = typeof location === 'undefined' ? '' : location.hash.slice(1);
  return h === 'pops' || h === 'entrevistas' ? h : 'visao';
};

/** O desenho de enfeite do cartão do fluxograma, para quando ainda não há miniatura. */
function FluxoIlustrado() {
  return (
    <svg className="fluxo-ilustrado" viewBox="0 0 560 72" aria-hidden="true">
      <path d="M130 36h52M250 36h50M446 36h58" />
      <rect x="2" y="9" width="128" height="54" rx="12" />
      <rect x="196" y="16" width="40" height="40" rx="6" transform="rotate(45 216 36)" />
      <rect x="300" y="9" width="146" height="54" rx="12" className="destaque" />
      <circle cx="531" cy="36" r="27" />
    </svg>
  );
}

function ProcessoPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [p, setP] = useState<Processo | null | undefined>(undefined);
  const [nome, setNome] = useState('');
  const [areas, setAreas] = useState<AreaResumo[]>([]);
  const [fluxoDialogo, setFluxoDialogo] = useState<'desenhar' | 'ia' | 'substituir' | null>(null);
  const [criandoPop, setCriandoPop] = useState(false); // diálogo "Novo POP" aberto
  const [ocupado, setOcupado] = useState(false);
  const [descricao, setDescricao] = useState('');
  const [salvandoDescricao, setSalvandoDescricao] = useState<'' | 'salvando' | 'erro'>('');
  const [copiado, setCopiado] = useState(false);
  const [alterandoLink, setAlterandoLink] = useState(false);
  const [movendo, setMovendo] = useState(false);
  const [aba, setAba] = useState<Aba>('visao');
  const [entrevistas, setEntrevistas] = useState<number | null>(null); // quantas entrevistas ativas (vem da seção)
  const [pedidoDeConvite, setPedidoDeConvite] = useState(0);
  const [codigoCopiado, setCodigoCopiado] = useState(false);
  const gestor = ehGestor(useEu());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const carregar = () => obterProcesso(id).then((d) => { setP(d); setNome(d.nome); setDescricao(d.descricao ?? ''); }).catch(() => setP(null));
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  useEffect(() => { setAba(abaDoEndereco()); }, []);
  function irPara(a: Aba) {
    setAba(a);
    try { history.replaceState(null, '', a === 'visao' ? location.pathname + location.search : `#${a}`); } catch { /* sem histórico: a aba muda só na tela */ }
  }
  useEffect(() => {
    void carregar();
    listarAreas().then(setAreas).catch(() => {});
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (p === undefined) return <div className="page fundo-processo"><p className="notice">Carregando…</p></div>;
  if (p === null) return <div className="page fundo-processo"><div className="empty"><h2>Processo não encontrado</h2><Link href="/app/processos" className="btn btn-primary">Voltar</Link></div></div>;
  const citadoEm = p.referenciado_em.length ? ` Atenção: este processo é referenciado em ${p.referenciado_em.length} ${p.referenciado_em.length === 1 ? 'documento' : 'documentos'}.` : '';

  // Novo POP: a pessoa dá o nome antes (o POP não herda o nome do processo).
  async function novoPop(nome: string) {
    const { id: popId } = await criarPop({ processo_id: p!.id, nome });
    router.push(`/app/pops/${popId}`);
  }

  // Arquivar em vez de excluir (decisão 31): só o que está arquivado pode ser excluído, e vai tudo junto.
  async function arquivar() {
    if (!(await confirmar({ titulo: `Arquivar o processo "${p!.nome}"?`, mensagem: `O processo some das listas com os POPs, gravações e fluxograma dele. Nada é apagado: dá para restaurar depois.${citadoEm}`, acao: 'Arquivar' }))) return;
    setOcupado(true);
    try { await arquivarProcesso(p!.id); await carregar(); } catch { void avisar('Não foi possível arquivar o processo.', 'Tente de novo em instantes.'); } finally { setOcupado(false); }
  }

  async function restaurar() {
    setOcupado(true);
    try { await restaurarProcesso(p!.id); await carregar(); } catch { void avisar('Não foi possível restaurar o processo.', 'Tente de novo em instantes.'); } finally { setOcupado(false); }
  }

  async function excluir() {
    const itens = [
      p!.pops.length && `${p!.pops.length} ${p!.pops.length === 1 ? 'POP' : 'POPs'}`,
      p!.gravacoes.length && `${p!.gravacoes.length} ${p!.gravacoes.length === 1 ? 'gravação' : 'gravações'}`,
      p!.fluxograma && 'o fluxograma',
    ].filter(Boolean).join(', ');
    if (!(await confirmar({ titulo: `Excluir definitivamente o processo "${p!.nome}"?`, mensagem: `${itens ? `Apaga o processo com ${itens}. ` : ''}Essa ação não pode ser desfeita.${citadoEm ? `${citadoEm} As referências passam a apontar para um documento excluído.` : ''}`, acao: 'Excluir', perigo: true }))) return;
    setOcupado(true);
    try {
      await excluirProcesso(p!.id);
      router.push(p!.area ? `/app/areas/${p!.area.id}` : '/app/organizacoes');
    } catch (e) {
      setOcupado(false);
      void avisar('Não foi possível excluir o processo.', e instanceof Error ? e.message : 'Tente de novo em instantes.');
    }
  }

  async function restaurarPopArquivado(popId: string) {
    try { await restaurarPop(popId); await carregar(); } catch { void avisar('Não foi possível restaurar o POP.', 'Tente de novo em instantes.'); }
  }

  const salvar = (dados: { nome?: string }) => void atualizarProcesso(p.id, dados);

  // Descrição (texto rico, com referências; decisão 35): salva 1 s depois da última alteração.
  function mudarDescricao(v: string) {
    setDescricao(v);
    setSalvandoDescricao('salvando');
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      atualizarProcesso(p!.id, { descricao: v }).then(() => setSalvandoDescricao('')).catch(() => setSalvandoDescricao('erro'));
    }, 1000);
  }
  function registrarReferencia(r: ResultadoBusca) {
    const k = `${r.tipo}:${r.id}`;
    setP((x) => x && !x.referencias[k] ? { ...x, referencias: { ...x.referencias, [k]: { tipo: r.tipo, id: r.id, nome: r.nome, identificacao: r.identificacao, codigo: r.codigo, rotulo: r.rotulo, situacao: r.situacao, publico: r.situacao === 'ok', url_app: `/app/${r.tipo === 'pop' ? 'pops' : 'processos'}/${r.id}`, url_publica: null } } } : x);
  }

  // Chave da página pública do processo (decisão 35): muda na hora; se o servidor recusar, volta.
  async function alternarLink() {
    const ativo = !p!.link_publico_ativo;
    setAlterandoLink(true);
    setP((x) => x && { ...x, link_publico_ativo: ativo });
    try {
      await definirLinkPublicoProcesso(p!.id, ativo);
    } catch (e) {
      setP((x) => x && { ...x, link_publico_ativo: !ativo });
      void avisar(ativo ? 'Não foi possível colocar a página pública no ar.' : 'Não foi possível tirar a página pública do ar.', e instanceof Error ? e.message : 'Tente de novo em instantes.');
    } finally {
      setAlterandoLink(false);
    }
  }
  async function copiarLink() {
    const url = `${location.origin}/pr/${p!.link_publico}`;
    try { await navigator.clipboard.writeText(url); setCopiado(true); setTimeout(() => setCopiado(false), 2500); } catch { void avisar('Copie o link público do processo', url); }
  }

  async function copiarCodigo() {
    try { await navigator.clipboard.writeText(p!.codigo); setCodigoCopiado(true); setTimeout(() => setCodigoCopiado(false), 2000); } catch { void avisar('Código do processo', p!.codigo); }
  }

  async function mudarArea(areaId: string) {
    if (!areaId || areaId === p!.area_id) return;
    await atualizarProcesso(p!.id, { area_id: areaId });
    setP({ ...p!, area_id: areaId, area: areas.find((a) => a.id === areaId) ?? p!.area });
  }

  const arquivado = !!p.arquivado_em;
  const pops = p.pops.filter((o) => !o.arquivado_em);
  const popsArquivados = p.pops.filter((o) => o.arquivado_em);
  const fluxo = p.fluxograma;

  const semEntrevistas = entrevistas === 0;
  // Resumo: "Atualizado" é a alteração mais recente entre o processo, o fluxograma e os POPs ativos.
  const publicados = pops.filter((o) => o.status === 'publicado').length;
  const atualizado = [p.atualizado_em, fluxo?.atualizado_em, ...pops.map((o) => o.atualizado_em)].filter((x): x is string => !!x).sort().at(-1)!;

  return (
    <ReferenciasContext.Provider value={p.referencias}>
    <div className="page fundo-processo pagina-processo">
      <nav className="trilha" aria-label="Caminho">
        {p.area?.organizacao && <><Link href={`/app/organizacoes/${p.area.organizacao.id}`}>{p.area.organizacao.nome}</Link><Icone nome="avancar" tamanho={14} /></>}
        {p.area && <><Link href={`/app/areas/${p.area.id}`}>{p.area.nome}</Link><Icone nome="avancar" tamanho={14} /></>}
        <span aria-current="page">{p.nome}</span>
      </nav>

      <div className="page-head proc-cabecalho">
        <span className={`proc-avatar avatar-${corDoAvatar(p.codigo)}`} aria-hidden="true">{iniciais(p.nome)}</span>
        <div className="proc-titulo">
          <input className="titulo-editavel" value={nome} onChange={(e) => setNome(e.target.value)} aria-label="Nome do processo" readOnly={arquivado}
            onBlur={() => nome.trim() && nome !== p.nome && salvar({ nome: nome.trim() })} />
          <div className="processo-meta">
            <span className="chip-tipo">Processo</span>
            <button type="button" className="chip-codigo" onClick={() => void copiarCodigo()} title="Copiar o código do processo" aria-label={`Código ${p.codigo}: copiar`}>
              <span>{p.codigo}</span><Icone nome={codigoCopiado ? 'check' : 'copiar'} tamanho={13} />
            </button>
            <label className="proc-area">Área
              <select className="select-area" value={p.area_id} onChange={(e) => void mudarArea(e.target.value)} aria-label="Área do processo" title="Mover para outra área" disabled={arquivado}>
                {areas.length
                  ? porOrganizacao(areas).map(([org, lista]) => (
                      <optgroup key={org} label={org}>{lista.map((a) => <option key={a.id} value={a.id}>{a.nome}</option>)}</optgroup>
                    ))
                  : p.area && <option value={p.area.id}>{p.area.nome}</option>}
              </select>
            </label>
          </div>
        </div>
        <div className="actions">
          {!arquivado && <button className="btn" title="Mover para outra área ou criar uma cópia" onClick={() => setMovendo(true)} disabled={ocupado}><Icone nome="mover" tamanho={16} />Mover ou copiar</button>}
          {!arquivado && <button className="btn" title="Tira o processo das listas, com tudo o que tem; dá para restaurar depois" onClick={arquivar} disabled={ocupado}><Icone nome="arquivar" tamanho={16} />Arquivar</button>}
        </div>
      </div>

      {arquivado && <FaixaArquivado tipo="processo" desde={p.arquivado_em!} aoRestaurar={restaurar} aoExcluir={excluir} ocupado={ocupado} />}

      <div className="abas" role="tablist" aria-label="Seções do processo">
        {ABAS.map((a) => (
          <button key={a.id} type="button" role="tab" id={`aba-${a.id}`} aria-controls={`painel-${a.id}`} aria-selected={aba === a.id} onClick={() => irPara(a.id)}>
            {a.rotulo}
            {a.id === 'pops' && <span className="aba-conta">{pops.length}</span>}
            {a.id === 'entrevistas' && entrevistas !== null && <span className="aba-conta">{entrevistas}</span>}
          </button>
        ))}
      </div>

      {/* Visão geral: à esquerda o processo em si (fluxograma e descrição); à direita, o resumo, a página pública e as entrevistas. */}
      <div className="proc-grade" role="tabpanel" id="painel-visao" aria-labelledby="aba-visao" hidden={aba !== 'visao'}>
        <div className="proc-coluna">
          <section className="cartao proc-fluxo" aria-label="Fluxograma do processo">
            {fluxo ? (
              <>
                <Link href={`/app/fluxogramas/${fluxo.id}`} className="fluxo-palco" aria-label={arquivado ? 'Ver fluxograma' : 'Abrir fluxograma'} title={arquivado ? 'Ver fluxograma' : 'Abrir fluxograma'}>
                  <span className="fluxo-etiqueta">Fluxograma</span>
                  {fluxo.miniatura ? <img className="fluxo-miniatura" src={fluxo.miniatura} alt="" /> : <FluxoIlustrado />}
                </Link>
                <div className="proc-fluxo-corpo">
                  <div>
                    <h3>{fluxo.nome}</h3>
                    <p className="proc-fluxo-meta">{fluxo.origem === 'ia' ? 'Gerado com IA' : 'Desenhado à mão'} · atualizado em {data(fluxo.atualizado_em)}</p>
                  </div>
                  <div className="proc-fluxo-acoes">
                    <Link href={`/app/fluxogramas/${fluxo.id}`} className="btn btn-primary" title={arquivado ? undefined : 'Abre o editor: mude o desenho, os textos e as setas; salva sozinho'}><Icone nome={arquivado ? 'fluxo' : 'marcar'} tamanho={16} />{arquivado ? 'Ver fluxograma' : 'Abrir fluxograma'}</Link>
                    {!arquivado && <button className="btn btn-ia" onClick={() => setFluxoDialogo('substituir')} title="A IA gera outro desenho no lugar do atual"><Icone nome="ia" tamanho={16} />Gerar de novo com IA</button>}
                    {fluxo.tem_svg && !arquivado && <a className="link-acao" href={`/f/${fluxo.link_publico}`} target="_blank" rel="noopener" title="Página pública só do fluxograma (o link do PDF e do DOCX)">Ver na página pública<Icone nome="externo" tamanho={15} /></a>}
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="fluxo-palco vazio">
                  <span className="fluxo-etiqueta">Fluxograma</span>
                  <FluxoIlustrado />
                </div>
                <div className="proc-fluxo-corpo">
                  <div>
                    <h3>Este processo ainda não tem fluxograma</h3>
                    <p className="proc-fluxo-meta">O fluxograma mostra o processo como um todo: o que acontece, em que ordem e como as etapas se encadeiam.</p>
                  </div>
                  {!arquivado && (
                    <div className="proc-fluxo-acoes">
                      <button className="btn btn-primary" onClick={() => setFluxoDialogo('desenhar')}><Icone nome="marcar" tamanho={16} />Desenhar</button>
                      <button className="btn btn-ia" onClick={() => setFluxoDialogo('ia')}><Icone nome="ia" tamanho={16} />Gerar com IA</button>
                    </div>
                  )}
                </div>
              </>
            )}
          </section>

          <section className="cartao descricao-processo" inert={arquivado} aria-labelledby="titulo-descricao">
            <div className="sec-titulo">
              <h3 id="titulo-descricao">Descrição do processo</h3>
              {!arquivado && (
                <MelhorarComIa variante="botao" rotulo="Descrição do processo" vazio={!textoPuro(descricao)} aoAplicar={mudarDescricao}
                  pedido={() => ({ campo: 'descricao', texto: descricao, processo: p.nome, area: p.area?.nome, organizacao: p.area?.organizacao?.nome })} />
              )}
            </div>
            <TextoRico valor={descricao} aoMudar={mudarDescricao} rotulo="Descrição do processo" linhas={5}
              placeholder="O que é este processo, onde começa e onde termina. Use “Referência” para citar os POPs e os outros processos ligados a ele."
              documento={{ tipo: 'processo', id: p.id }} aoReferenciar={registrarReferencia} />
            <div className="descricao-rodape">
              {salvandoDescricao === 'erro'
                ? <span className="salvo-auto erro" role="alert">Erro ao salvar. Tente editar de novo.</span>
                : salvandoDescricao === 'salvando'
                  ? <span className="salvo-auto" role="status">Salvando…</span>
                  : <span className="salvo-auto ok" role="status"><Icone nome="check" tamanho={15} />Salvo automaticamente</span>}
              <p className="notice">Aparece na página pública. Referências viram links para os documentos citados.</p>
            </div>
          </section>

          {p.referenciado_em.length > 0 && (
            <section className="cartao" aria-labelledby="titulo-referenciado">
              <h3 id="titulo-referenciado" className="cartao-titulo"><Icone nome="link" tamanho={18} />Referenciado em</h3>
              <ReferenciadoEm itens={p.referenciado_em} href={(x) => x.url_app || null} aviso="Estes documentos citam este processo. Na página pública deles, a referência leva à página pública deste processo." />
            </section>
          )}
        </div>

        <aside className="proc-coluna" aria-label="Resumo, página pública e entrevistas">
          <section className="cartao cartao-lateral" aria-labelledby="titulo-resumo">
            <h3 id="titulo-resumo">Resumo</h3>
            <dl className="resumo-processo">
              {p.area?.organizacao && <div><dt>Organização</dt><dd>{p.area.organizacao.nome}</dd></div>}
              {p.area && <div><dt>Área</dt><dd>{p.area.nome}</dd></div>}
              <div><dt>POPs</dt><dd>{pops.length}{publicados > 0 ? ` (${publicados} ${publicados === 1 ? 'publicado' : 'publicados'})` : ''}</dd></div>
              <div><dt>Entrevistas</dt><dd>{entrevistas ?? '…'}</dd></div>
              <div><dt>Atualizado</dt><dd>{data(atualizado)}</dd></div>
            </dl>
          </section>

          <PaginaPublica tipo="processo" variante="cartao" estado={arquivado ? 'arquivado' : p.link_publico_ativo ? 'online' : 'offline'} url={`/pr/${p.link_publico}`}
            alterando={alterandoLink} copiado={copiado} aoAlternar={alternarLink} aoCopiar={copiarLink} />

          <section className="cartao cartao-lateral" aria-labelledby="titulo-cartao-entrevistas">
            <div className="lateral-topo">
              <span className="lateral-icone icone-maia"><Icone nome="microfone" tamanho={20} /></span>
              <div className="lateral-titulo">
                <h3 id="titulo-cartao-entrevistas">Entrevistas com a Maia</h3>
                <span>{entrevistas === null ? 'Carregando…' : semEntrevistas ? 'Nenhuma entrevista ainda' : `${entrevistas} ${entrevistas === 1 ? 'entrevista' : 'entrevistas'}`}</span>
              </div>
            </div>
            <p className="lateral-texto">{semEntrevistas || entrevistas === null
              ? 'Convide quem executa o processo para conversar com a Maia por voz, no seu tempo.'
              : 'Cada pessoa conversa com a Maia por voz, no seu tempo, e o que ela contar fica registrado no processo.'}</p>
            {gestor && !arquivado && <button type="button" className="btn btn-maia btn-largo" onClick={() => setPedidoDeConvite((n) => n + 1)}><Icone nome="mais" />Convidar pessoa</button>}
            {(!semEntrevistas || !gestor || arquivado) && entrevistas !== null && <button type="button" className="btn btn-largo" onClick={() => irPara('entrevistas')}>Ver entrevistas</button>}
          </section>
        </aside>
      </div>

      {/* POPs: a visão micro, um POP por atividade. */}
      <section className="secao-processo" role="tabpanel" id="painel-pops" aria-labelledby="aba-pops" hidden={aba !== 'pops'}>
        <div className="secao-head">
          <h2><Icone nome="pop" tamanho={18} />POPs do processo</h2>
          {!arquivado && <button className="btn btn-primary" onClick={() => setCriandoPop(true)}><Icone nome="mais" />Novo POP</button>}
        </div>
        {pops.length === 0 && (
          <p className="notice">{arquivado ? 'Nenhum POP ativo neste processo.' : 'Nenhum POP ainda. Cada POP ensina a executar uma atividade do processo: crie um e escreva o passo a passo, gravando a tela se quiser.'}</p>
        )}
        <div className="lista-pops">
          {pops.map((o) => (
            <article key={o.id} className="linha-pop pop-destaque">
              <span className="pop-icone"><Icone nome="rota" tamanho={22} /></span>
              <Link href={`/app/pops/${o.id}`} className="pop-nome">
                <strong>{o.nome}</strong>
                <span>{o.identificacao || 'Sem identificação'} · Versão {o.versao} · atualizado em {data(o.atualizado_em)}</span>
              </Link>
              <SeloStatus status={o.status as StatusPop} offline={!o.link_publico_ativo} />
              <a className="btn btn-ghost" href={`/api/pops/${o.id}/pdf`} title="Baixar PDF"><Icone nome="baixar" tamanho={16} />PDF</a>
              <a className="btn btn-ghost" href={`/api/pops/${o.id}/docx`} title="Baixar DOCX"><Icone nome="baixar" tamanho={16} />DOCX</a>
              {o.status === 'rascunho' && !arquivado
                ? <Link className="btn" href={`/app/pops/${o.id}?retomar=1`} title="Abre o POP no ponto em que você parou">Continuar</Link>
                : <Link className="btn" href={`/app/pops/${o.id}`}>Abrir POP</Link>}
            </article>
          ))}
          {popsArquivados.map((o) => (
            <article key={o.id} className="linha-pop arquivada">
              <span className="pop-icone"><Icone nome="arquivar" tamanho={20} /></span>
              <Link href={`/app/pops/${o.id}`} className="pop-nome">
                <strong>{o.nome}</strong>
                <span>Arquivado em {data(o.arquivado_em!)} · Versão {o.versao}</span>
              </Link>
              <SeloStatus status={o.status as StatusPop} offline={!o.link_publico_ativo} />
              {!arquivado && <button type="button" className="btn btn-ghost" onClick={() => restaurarPopArquivado(o.id)}><Icone nome="desfazer" tamanho={16} />Restaurar</button>}
            </article>
          ))}
        </div>
      </section>

      {/* Entrevistas com a Maia sobre este processo (decisão 53): por convite, uma por pessoa. Fica sempre montada,
          mesmo com a aba escondida: é ela que conta as entrevistas e abre o diálogo de convite. */}
      <div role="tabpanel" id="painel-entrevistas" aria-labelledby="aba-entrevistas" hidden={aba !== 'entrevistas'}>
        <EntrevistasDoProcesso processoId={p.id} processoNome={p.nome} arquivado={arquivado} pedidoDeConvite={pedidoDeConvite}
          aoContar={setEntrevistas} aoChamarAtencao={() => irPara('entrevistas')} />
      </div>

      {fluxoDialogo && (
        <NovoFluxograma
          processoId={p.id}
          substituir={fluxoDialogo === 'substituir'}
          modoInicial={fluxoDialogo === 'desenhar' ? 'manual' : 'ia'}
          nomeSugerido={p.nome}
          aoFechar={() => setFluxoDialogo(null)}
          aoCriar={(fid) => router.push(`/app/fluxogramas/${fid}`)}
        />
      )}
      {criandoPop && (
        <DialogoNome titulo="Novo POP" rotulo="Nome do POP" exemplo="Ex.: Criação de pedido de compra" aviso={<>O POP entra no processo <b>{p.nome}</b>.</>}
          aoCriar={novoPop} aoFechar={() => setCriandoPop(false)} />
      )}
      {movendo && (
        <MoverCopiar item={{ tipo: 'processo', id: p.id, nome: p.nome, area_id: p.area_id, totais: { pops: pops.length, gravacoes: p.gravacoes.length, fluxograma: !!fluxo } }}
          aoConcluir={({ acao, id: novo }) => { setMovendo(false); if (acao === 'copiar') router.push(`/app/processos/${novo}`); else void carregar(); }}
          aoFechar={() => setMovendo(false)} />
      )}
    </div>
    </ReferenciasContext.Provider>
  );
}

export default function Pagina() {
  return <Suspense><ProcessoPage /></Suspense>;
}
