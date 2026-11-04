'use client';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { Suspense, useEffect, useRef, useState } from 'react';
import { Icone } from '@/components/Icone';
import { avisar, confirmar } from '@/components/Dialogos';
import { FaixaArquivado } from '@/components/FaixaArquivado';
import { NovoFluxograma } from '@/components/NovoFluxograma';
import { SeloStatus } from '@/components/SeloStatus';
import { PaginaPublica } from '@/components/pop/PaginaPublica';
import { ReferenciasContext } from '@/components/pop/Referencia';
import { TextoRico } from '@/components/pop/TextoRico';
import { ReferenciadoEm } from '@/components/publico/Referencias';
import type { ResultadoBusca } from '@/lib/referencias';
import { criarPop, restaurarPop, type StatusPop } from '@/lib/pops';
import { listarAreas, porOrganizacao, type AreaResumo } from '@/lib/areas';
import { arquivarProcesso, atualizarProcesso, definirLinkPublicoProcesso, excluirProcesso, obterProcesso, restaurarProcesso, type Processo } from '@/lib/processos';

// Página do processo em duas frentes (decisão 31): os recursos do processo (o fluxograma, um por
// processo) e a gestão dos POPs dele. Gravações ficam dentro de cada POP.

const data = (iso: string) => new Date(iso).toLocaleDateString('pt-BR');

function ProcessoPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [p, setP] = useState<Processo | null | undefined>(undefined);
  const [nome, setNome] = useState('');
  const [areas, setAreas] = useState<AreaResumo[]>([]);
  const [fluxoDialogo, setFluxoDialogo] = useState<'desenhar' | 'ia' | 'substituir' | null>(null);
  const [criandoPop, setCriandoPop] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [descricao, setDescricao] = useState('');
  const [salvandoDescricao, setSalvandoDescricao] = useState<'' | 'salvando' | 'erro'>('');
  const [copiado, setCopiado] = useState(false);
  const [alterandoLink, setAlterandoLink] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const carregar = () => obterProcesso(id).then((d) => { setP(d); setNome(d.nome); setDescricao(d.descricao ?? ''); }).catch(() => setP(null));
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  useEffect(() => {
    void carregar();
    listarAreas().then(setAreas).catch(() => {});
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (p === undefined) return <div className="page"><p className="notice">Carregando…</p></div>;
  if (p === null) return <div className="page"><div className="empty"><h2>Processo não encontrado</h2><Link href="/app/processos" className="btn btn-primary">Voltar</Link></div></div>;
  const citadoEm = p.referenciado_em.length ? ` Atenção: este processo é referenciado em ${p.referenciado_em.length} ${p.referenciado_em.length === 1 ? 'documento' : 'documentos'}.` : '';

  async function novoPop() {
    setCriandoPop(true);
    try {
      const { id: popId } = await criarPop({ processo_id: p!.id, nome: p!.nome });
      router.push(`/app/pops/${popId}`);
    } catch {
      setCriandoPop(false);
      void avisar('Não foi possível criar o POP.', 'Tente de novo em instantes.');
    }
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

  async function mudarArea(areaId: string) {
    if (!areaId || areaId === p!.area_id) return;
    await atualizarProcesso(p!.id, { area_id: areaId });
    setP({ ...p!, area_id: areaId, area: areas.find((a) => a.id === areaId) ?? p!.area });
  }

  const arquivado = !!p.arquivado_em;
  const pops = p.pops.filter((o) => !o.arquivado_em);
  const popsArquivados = p.pops.filter((o) => o.arquivado_em);
  const fluxo = p.fluxograma;

  return (
    <ReferenciasContext.Provider value={p.referencias}>
    <div className="page">
      <div className="page-head">
        <div>
          <nav className="migalha" aria-label="Caminho">
            {p.area?.organizacao && <><Link href={`/app/organizacoes/${p.area.organizacao.id}`}>{p.area.organizacao.nome}</Link><span>›</span></>}
            {p.area && <Link href={`/app/areas/${p.area.id}`}>{p.area.nome}</Link>}
          </nav>
          <input className="titulo-editavel" value={nome} onChange={(e) => setNome(e.target.value)} aria-label="Nome do processo" readOnly={arquivado}
            onBlur={() => nome.trim() && nome !== p.nome && salvar({ nome: nome.trim() })} />
          <p className="processo-meta">
            <span className="code">{p.codigo}</span>
            <select className="select-area" value={p.area_id} onChange={(e) => void mudarArea(e.target.value)} aria-label="Área do processo" title="Mover para outra área" disabled={arquivado}>
              {areas.length
                ? porOrganizacao(areas).map(([org, lista]) => (
                    <optgroup key={org} label={org}>{lista.map((a) => <option key={a.id} value={a.id}>{a.nome}</option>)}</optgroup>
                  ))
                : p.area && <option value={p.area.id}>{p.area.nome}</option>}
            </select>
          </p>
        </div>
        <div className="actions">
          {!arquivado && <button className="btn btn-ghost" title="Tira o processo das listas, com tudo o que tem; dá para restaurar depois" onClick={arquivar} disabled={ocupado}><Icone nome="arquivar" tamanho={16} />Arquivar</button>}
        </div>
      </div>

      {arquivado && <FaixaArquivado tipo="processo" desde={p.arquivado_em!} aoRestaurar={restaurar} aoExcluir={excluir} ocupado={ocupado} />}

      <PaginaPublica tipo="processo" estado={arquivado ? 'arquivado' : p.link_publico_ativo ? 'online' : 'offline'} url={`/pr/${p.link_publico}`}
        alterando={alterandoLink} copiado={copiado} aoAlternar={alternarLink} aoCopiar={copiarLink} />

      {/* Frente 1: a visão macro do processo. */}
      <section className="secao-processo">
        <div className="secao-head">
          <h2><Icone nome="fluxo" tamanho={18} />Recursos do processo</h2>
        </div>
        <div className="cartao fluxo-cartao">
          {fluxo ? (
            <>
              <Link href={`/app/fluxogramas/${fluxo.id}`} className="fluxo-previa" aria-label={arquivado ? 'Ver fluxograma' : 'Editar fluxograma'} title={arquivado ? 'Ver fluxograma' : 'Editar fluxograma'}>
                {fluxo.miniatura
                  ? <img className="fluxo-miniatura" src={fluxo.miniatura} alt="" />
                  : <span className="pop-icone fluxo-icone"><Icone nome="fluxo" tamanho={22} /></span>}
              </Link>
              <div className="fluxo-info">
                <strong>{fluxo.nome}</strong>
                <span>Fluxograma do processo · {fluxo.origem === 'ia' ? 'gerado com IA' : 'desenhado à mão'} · atualizado em {data(fluxo.atualizado_em)}</span>
              </div>
              <span className="fluxo-acoes">
                {fluxo.tem_svg && !arquivado && <a className="btn btn-ghost" href={`/f/${fluxo.link_publico}`} target="_blank" rel="noopener" title="Página pública só do fluxograma (o link do PDF e do DOCX)"><Icone nome="externo" tamanho={16} />Página pública</a>}
                {!arquivado && <button className="btn btn-ghost" onClick={() => setFluxoDialogo('substituir')} title="A IA gera outro desenho no lugar do atual"><Icone nome="ia" tamanho={16} />Gerar de novo com IA</button>}
                <Link href={`/app/fluxogramas/${fluxo.id}`} className="btn btn-primary" title={arquivado ? undefined : 'Abre o editor: mude o desenho, os textos e as setas; salva sozinho'}><Icone nome={arquivado ? 'fluxo' : 'marcar'} tamanho={16} />{arquivado ? 'Ver fluxograma' : 'Editar fluxograma'}</Link>
              </span>
            </>
          ) : (
            <>
              <span className="pop-icone fluxo-icone"><Icone nome="fluxo" tamanho={22} /></span>
              <div className="fluxo-info">
                <strong>Este processo ainda não tem fluxograma.</strong>
                <span>O fluxograma mostra o processo como um todo: o que acontece, em que ordem e como as etapas se encadeiam.</span>
              </div>
              {!arquivado && (
                <span className="fluxo-acoes">
                  <button className="btn" onClick={() => setFluxoDialogo('desenhar')}><Icone nome="marcar" tamanho={16} />Desenhar</button>
                  <button className="btn btn-primary" onClick={() => setFluxoDialogo('ia')}><Icone nome="ia" tamanho={16} />Gerar com IA</button>
                </span>
              )}
            </>
          )}
        </div>
        <div className="cartao descricao-processo" inert={arquivado}>
          <div className="sec-titulo">
            <h3>Descrição do processo</h3>
            {salvandoDescricao && <span className={`notice ${salvandoDescricao === 'erro' ? 'erro' : ''}`}>{salvandoDescricao === 'salvando' ? 'Salvando…' : 'Erro ao salvar. Tente editar de novo.'}</span>}
          </div>
          <TextoRico valor={descricao} aoMudar={mudarDescricao} rotulo="Descrição do processo" linhas={4}
            placeholder="O que é este processo, onde começa e onde termina. Use “Referência” para citar os POPs e os outros processos ligados a ele."
            documento={{ tipo: 'processo', id: p.id }} aoReferenciar={registrarReferencia} />
          <p className="notice">Aparece na página pública do processo. As referências viram links para os documentos citados.</p>
        </div>
      </section>

      {p.referenciado_em.length > 0 && (
        <section className="secao-processo" aria-labelledby="titulo-referenciado">
          <div className="secao-head"><h2 id="titulo-referenciado"><Icone nome="link" tamanho={18} />Referenciado em</h2></div>
          <div className="cartao">
            <ReferenciadoEm itens={p.referenciado_em} href={(x) => x.url_app || null} aviso="Estes documentos citam este processo. Na página pública deles, a referência leva à página pública deste processo." />
          </div>
        </section>
      )}

      {/* Frente 2: a visão micro, um POP por atividade. */}
      <section className="secao-processo">
        <div className="secao-head">
          <h2><Icone nome="pop" tamanho={18} />POPs do processo</h2>
          {!arquivado && <button className="btn btn-primary" onClick={novoPop} disabled={criandoPop}><Icone nome="mais" />{criandoPop ? 'Criando…' : 'Novo POP'}</button>}
        </div>
        {pops.length === 0 && (
          <p className="notice">{arquivado ? 'Nenhum POP ativo neste processo.' : 'Nenhum POP ainda. Cada POP ensina a executar uma atividade do processo: crie um e escreva o passo a passo, gravando a tela se quiser.'}</p>
        )}
        <div className="lista-pops">
          {pops.map((o) => (
            <article key={o.id} className="linha-pop pop-destaque">
              <span className="pop-icone"><Icone nome="pop" tamanho={22} /></span>
              <Link href={`/app/pops/${o.id}`} className="pop-nome">
                <strong>{o.nome}</strong>
                <span>{o.identificacao || 'Sem identificação'} · Versão {o.versao} · atualizado em {data(o.atualizado_em)}</span>
              </Link>
              <SeloStatus status={o.status as StatusPop} offline={!o.link_publico_ativo} />
              <a className="btn btn-ghost" href={`/api/pops/${o.id}/pdf`} title="Baixar PDF"><Icone nome="baixar" tamanho={16} />PDF</a>
              <a className="btn btn-ghost" href={`/api/pops/${o.id}/docx`} title="Baixar DOCX"><Icone nome="baixar" tamanho={16} />DOCX</a>
              {o.status === 'rascunho' && !arquivado
                ? <Link className="btn btn-primary" href={`/app/pops/${o.id}?retomar=1`} title="Abre o POP no ponto em que você parou">Continuar</Link>
                : <Link className="btn btn-primary" href={`/app/pops/${o.id}`}>Abrir POP</Link>}
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
    </div>
    </ReferenciasContext.Provider>
  );
}

export default function Pagina() {
  return <Suspense><ProcessoPage /></Suspense>;
}
