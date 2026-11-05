'use client';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { Icone } from '@/components/Icone';
import { confirmar } from '@/components/Dialogos';
import { NovoProcesso } from '@/components/NovoProcesso';
import { MoverCopiar } from '@/components/MoverCopiar';
import { SeloStatus } from '@/components/SeloStatus';
import { arquivarPop, criarPop, dataCurta, excluirPop, listarPops, ondeEsta, restaurarPop, type PopResumo } from '@/lib/pops';
import { listarProcessos, type ProcessoResumo } from '@/lib/processos';

type Filtro = 'todos' | 'rascunho' | 'publicado' | 'arquivados';
const FILTROS: { id: Filtro; rotulo: string }[] = [
  { id: 'todos', rotulo: 'Todos' },
  { id: 'rascunho', rotulo: 'Rascunho' },
  { id: 'publicado', rotulo: 'Publicado' },
  { id: 'arquivados', rotulo: 'Arquivados' },
];

// Gestão dos documentos: todos os POPs, onde estão, em que estado e para baixar.
function ListaPops() {
  const router = useRouter();
  const inicial = useSearchParams().get('status');
  const [itens, setItens] = useState<PopResumo[] | null>(null);
  const [arquivados, setArquivados] = useState<PopResumo[]>([]); // ficam fora de "Todos"
  const [erro, setErro] = useState('');
  const [busca, setBusca] = useState('');
  const [filtro, setFiltro] = useState<Filtro>(inicial === 'rascunho' || inicial === 'publicado' || inicial === 'arquivados' ? inicial : 'todos');
  const [novo, setNovo] = useState(false);
  const [novoProcesso, setNovoProcesso] = useState(false);
  const [processos, setProcessos] = useState<ProcessoResumo[] | null>(null);
  const [processoId, setProcessoId] = useState('');
  const [nomeNovo, setNomeNovo] = useState('');
  const [criando, setCriando] = useState(false);
  const [movendo, setMovendo] = useState<PopResumo | null>(null);

  const atualizar = () => Promise.all([listarPops(), listarPops(true)])
    .then(([ativos, arq]) => { setItens(ativos); setArquivados(arq); })
    .catch((e) => { setErro(e.message); setItens([]); });
  useEffect(() => { atualizar(); }, []);

  const passaFiltro = (p: PopResumo, f: Filtro) => f === 'todos' || f === 'arquivados' || (f === 'publicado' ? p.status === 'publicado' : p.status !== 'publicado');
  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return (filtro === 'arquivados' ? arquivados : itens ?? [])
      .filter((p) => passaFiltro(p, filtro))
      .filter((p) => !q || [p.nome, p.identificacao, p.codigo, ondeEsta(p)].some((x) => x.toLowerCase().includes(q)));
  }, [itens, arquivados, busca, filtro]);
  const conta = (f: Filtro) => (f === 'arquivados' ? arquivados : itens ?? []).filter((p) => passaFiltro(p, f)).length;

  function abrirNovo() {
    setNovo(true);
    setNomeNovo('');
    setErro('');
    listarProcessos().then(setProcessos).catch(() => setProcessos([]));
  }

  async function criar(e: React.FormEvent) {
    e.preventDefault();
    const pr = processos?.find((x) => x.id === processoId);
    if (!pr || !nomeNovo.trim()) return;
    setCriando(true);
    try {
      // A pessoa dá o nome do POP (ele não herda o nome do processo).
      const { id } = await criarPop({ processo_id: pr.id, nome: nomeNovo.trim() });
      router.push(`/app/pops/${id}`);
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao criar');
      setCriando(false);
    }
  }

  async function onArquivar(p: PopResumo) {
    if (!(await confirmar({ titulo: `Arquivar o POP "${p.nome}"?`, mensagem: 'O POP some das listas e não pode ser editado. Nada é apagado: dá para restaurar depois.', acao: 'Arquivar' }))) return;
    await arquivarPop(p.id);
    atualizar();
  }

  async function onRestaurar(p: PopResumo) {
    await restaurarPop(p.id);
    atualizar();
  }

  async function onExcluir(p: PopResumo) {
    if (!(await confirmar({ titulo: `Excluir definitivamente o POP "${p.nome}"?`, mensagem: 'Apaga o POP com as gravações dele. Essa ação não pode ser desfeita.', acao: 'Excluir', perigo: true }))) return;
    await excluirPop(p.id);
    atualizar();
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>POPs</h1>
          <p>Os Procedimentos Operacionais Padrão de todos os processos: o que está em elaboração, o que está publicado e onde está cada um.</p>
        </div>
        <div className="actions">
          <button className="btn btn-primary" onClick={abrirNovo}><Icone nome="mais" />Novo POP</button>
        </div>
      </div>
      {erro && !novo && <div className="aviso erro">{erro}</div>}

      <div className="barra-filtros">
        <label className="search">
          <Icone nome="busca" />
          <input type="search" placeholder="Buscar por nome, identificação, área ou processo" value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Buscar POPs" />
        </label>
        <div className="segmented" role="tablist" aria-label="Status">
          {FILTROS.map((f) => (
            <button key={f.id} type="button" role="tab" aria-selected={filtro === f.id} onClick={() => setFiltro(f.id)}>
              {f.rotulo} <span className="conta">{conta(f.id)}</span>
            </button>
          ))}
        </div>
      </div>

      {itens === null && <p className="notice">Carregando…</p>}
      {itens?.length === 0 && !erro && (
        <div className="empty">
          <h2>Nenhum POP ainda</h2>
          <p>Cada POP pertence a um processo. Abra um processo e grave a tela narrando os passos: a IA escreve o POP para você.</p>
          <button className="btn btn-primary" onClick={abrirNovo}><Icone nome="mais" />Criar o primeiro</button>
        </div>
      )}
      {itens && (itens.length > 0 || filtro === 'arquivados') && filtrados.length === 0 && <p className="notice">{filtro === 'arquivados' ? 'Nenhum POP arquivado.' : 'Nenhum POP encontrado com esse filtro.'}</p>}

      <div className="lista-pops">
        {filtrados.map((p) => (
          <article key={p.id} className={`linha-pop ${filtro === 'arquivados' ? 'arquivada' : ''}`}>
            <span className="pop-icone"><Icone nome={filtro === 'arquivados' ? 'arquivar' : 'pop'} tamanho={20} /></span>
            <Link href={`/app/pops/${p.id}`} className="pop-nome">
              <strong>{p.nome}</strong>
              <span>{ondeEsta(p)}</span>
              <span>
                {p.identificacao || 'Sem identificação'} · Versão {p.versao} · atualizado em {dataCurta(p.atualizado_em)}
                {filtro === 'arquivados' && (p.arquivado_em ? ` · arquivado em ${new Date(p.arquivado_em).toLocaleDateString('pt-BR')}` : ' · o processo está arquivado')}
              </span>
            </Link>
            <SeloStatus status={p.status} offline={!p.link_publico_ativo} />
            <a className="btn btn-ghost" href={`/api/pops/${p.id}/pdf`} title="Baixar PDF"><Icone nome="baixar" tamanho={16} />PDF</a>
            <a className="btn btn-ghost" href={`/api/pops/${p.id}/docx`} title="Baixar DOCX"><Icone nome="baixar" tamanho={16} />DOCX</a>
            {filtro === 'arquivados' ? (
              <>
                {p.arquivado_em && <button className="btn btn-ghost" onClick={() => onRestaurar(p)}><Icone nome="desfazer" tamanho={16} />Restaurar</button>}
                <button className="btn btn-ghost btn-icon" aria-label="Excluir definitivamente" title="Excluir definitivamente" onClick={() => onExcluir(p)}><Icone nome="lixo" tamanho={16} /></button>
              </>
            ) : (
              <>
                <button className="btn btn-ghost btn-icon" aria-label="Mover ou copiar" title="Mover para outro processo ou criar uma cópia" onClick={() => setMovendo(p)}><Icone nome="mover" tamanho={16} /></button>
                <button className="btn btn-ghost btn-icon" aria-label="Arquivar" title="Arquivar" onClick={() => onArquivar(p)}><Icone nome="arquivar" tamanho={16} /></button>
              </>
            )}
          </article>
        ))}
      </div>

      {novo && (
        <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="novo-pop" onClick={() => !criando && setNovo(false)}>
          <form className="dialog" onClick={(e) => e.stopPropagation()} onSubmit={criar}>
            <h2 id="novo-pop">Novo POP</h2>
            <label className="field">
              De qual processo?
              <select value={processoId} onChange={(e) => setProcessoId(e.target.value)} required disabled={processos === null}>
                <option value="">{processos === null ? 'Carregando…' : 'Escolha o processo…'}</option>
                {(processos ?? []).map((pr) => (
                  <option key={pr.id} value={pr.id}>{[pr.area?.organizacao?.nome, pr.area?.nome, pr.nome].filter(Boolean).join(' · ')}</option>
                ))}
              </select>
            </label>
            <label className="field">
              Nome do POP
              <input value={nomeNovo} onChange={(e) => setNomeNovo(e.target.value)} maxLength={200} required placeholder="Ex.: Criação de pedido de compra" />
            </label>
            <p className="notice">
              O POP começa em branco. Para a IA escrever o POP a partir de uma gravação de tela, abra o processo e use <b>Gravar a tela</b>.
              {' '}O processo não existe ainda? <button type="button" className="link-sec" onClick={() => { setNovo(false); setNovoProcesso(true); }}>Criar processo</button>
            </p>
            {erro && <p className="form-erro" role="alert">{erro}</p>}
            <div className="dialog-actions">
              <button type="button" className="btn" onClick={() => setNovo(false)} disabled={criando}>Cancelar</button>
              <button type="submit" className="btn btn-primary" disabled={criando || !processoId || !nomeNovo.trim()}>{criando ? 'Criando…' : 'Criar e editar'}</button>
            </div>
          </form>
        </div>
      )}
      {novoProcesso && <NovoProcesso aoFechar={() => setNovoProcesso(false)} />}
      {movendo && (
        <MoverCopiar item={{ tipo: 'pop', id: movendo.id, nome: movendo.nome, identificacao: movendo.identificacao, processo: movendo.processo }}
          aoConcluir={({ acao, id }) => { setMovendo(null); if (acao === 'copiar') router.push(`/app/pops/${id}`); else atualizar(); }}
          aoFechar={() => setMovendo(null)} />
      )}
    </div>
  );
}

export default function PopsPage() {
  return <Suspense><ListaPops /></Suspense>;
}
