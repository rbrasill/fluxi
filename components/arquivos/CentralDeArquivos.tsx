'use client';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Icone } from '@/components/Icone';
import { SeloDocumento } from '@/components/SeloDocumento';
import { ROTULO_SITUACAO, SITUACOES, abrirArquivo, dataBr, formatoDe, nomeDaEtapa, tamanhoLegivel, textoDaValidade, type ArquivoDoProcesso, type PopComArquivos, type Situacao } from '@/lib/anexos';
import { IconeDoArquivo, SeloSituacao } from './Pecas';
import { VisualizadorDeArquivo } from './VisualizadorDeArquivo';

// A central de arquivos do processo (decisão 141): os arquivos de todos os POPs do processo num lugar só, agrupados
// por POP e, dentro dele, por etapa, com filtros por POP, etapa e situação. Só consulta: anexar, editar e excluir
// é na aba Arquivos de cada POP.

const GERAL = 0; // "etapa" dos arquivos que não estão em nenhuma etapa

export function CentralDeArquivos({ pops }: { pops: PopComArquivos[] | null }) {
  const [pop, setPop] = useState('');
  const [etapa, setEtapa] = useState(''); // '' = todas; '0' = geral do POP; 'N' = a etapa N
  const [situacao, setSituacao] = useState<Situacao | ''>('');
  const [vendo, setVendo] = useState<{ pop: string; arquivo: string } | null>(null);

  const todos = useMemo(() => (pops ?? []).flatMap((p) => p.arquivos), [pops]);
  const conta = (s: Situacao) => todos.filter((a) => a.situacao === s).length;
  const escolhido = (pops ?? []).find((p) => p.id === pop);

  const grupos = useMemo(() => (pops ?? []).filter((p) => !pop || p.id === pop).flatMap((p) => {
    const passa = (a: ArquivoDoProcesso) => !situacao || a.situacao === situacao;
    const ordens = [GERAL, ...p.etapas.map((e) => e.ordem)].filter((o) => !pop || etapa === '' || String(o) === etapa);
    const etapas = ordens.flatMap((o) => {
      const arquivos = p.arquivos.filter((a) => passa(a) && (o === GERAL ? a.etapas.length === 0 : a.etapas.includes(o)));
      return arquivos.length ? [{ ordem: o, nome: o === GERAL ? 'Geral do POP' : nomeDaEtapa(o, p.etapas.find((e) => e.ordem === o)?.nome ?? ''), arquivos }] : [];
    });
    return etapas.length ? [{ pop: p, etapas }] : [];
  }), [pops, pop, etapa, situacao]);

  if (pops === null) return <section className="cartao"><p className="notice">Carregando…</p></section>;
  if (todos.length === 0) {
    return (
      <section className="cartao central-vazia">
        <span className="central-vazia-icone"><Icone nome="clipe" tamanho={22} /></span>
        <h2>Nenhum arquivo neste processo</h2>
        <p>Os arquivos são anexados em cada POP, na aba Arquivos, e aparecem aqui.</p>
      </section>
    );
  }

  const aberto = vendo && (pops.find((p) => p.id === vendo.pop) ?? null);
  return (
    <section className="cartao central" aria-labelledby="titulo-central">
      <div className="sec-titulo">
        <div className="sec-cabeca">
          <h2 className="titulo-com-conta" id="titulo-central">Arquivos do processo<small>{todos.length}</small></h2>
          <p>Os arquivos de todos os POPs deste processo.</p>
        </div>
      </div>

      <div className="central-resumo" role="group" aria-label="Filtrar por situação">
        <button type="button" className="central-cartao" aria-pressed={situacao === ''} onClick={() => setSituacao('')}><strong>{todos.length}</strong><span>Todos</span></button>
        {SITUACOES.map((s) => (
          <button key={s} type="button" className={`central-cartao central-${s}`} aria-pressed={situacao === s} onClick={() => setSituacao(situacao === s ? '' : s)} disabled={conta(s) === 0}>
            <strong>{conta(s)}</strong><span>{ROTULO_SITUACAO[s]}</span>
          </button>
        ))}
      </div>

      <div className="central-filtros">
        <label className="field">POP
          <select value={pop} onChange={(e) => { setPop(e.target.value); setEtapa(''); }}>
            <option value="">Todos os POPs</option>
            {pops.map((p) => <option key={p.id} value={p.id}>{p.identificacao ? `${p.identificacao} · ` : ''}{p.nome}</option>)}
          </select>
        </label>
        <label className="field">Etapa
          <select value={etapa} onChange={(e) => setEtapa(e.target.value)} disabled={!escolhido} title={escolhido ? undefined : 'Escolha um POP para filtrar por etapa'}>
            <option value="">Todas as etapas</option>
            {escolhido && <option value={String(GERAL)}>Geral do POP</option>}
            {escolhido?.etapas.map((e) => <option key={e.ordem} value={e.ordem}>{nomeDaEtapa(e.ordem, e.nome)}</option>)}
          </select>
        </label>
      </div>

      {grupos.length === 0 && <p className="recursos-vazio">Nenhum arquivo com esses filtros.</p>}
      {grupos.map(({ pop: p, etapas }) => (
        <article key={p.id} className="central-pop" aria-label={`POP ${p.nome}`}>
          <header className="central-pop-topo">
            <SeloDocumento tipo="pop" />
            <h3>{p.identificacao && <span className="mono">{p.identificacao}</span>}{p.nome}</h3>
            <Link className="btn btn-ghost" href={`/app/pops/${p.id}?aba=arquivos`} title="Abrir a aba Arquivos deste POP"><Icone nome="externo" tamanho={15} />Abrir POP</Link>
          </header>
          {etapas.map((e) => (
            <div key={e.ordem} className="central-etapa">
              <h4>{e.nome}<small>{e.arquivos.length}</small></h4>
              <ul className="central-lista">
                {e.arquivos.map((a) => {
                  const expirado = a.situacao === 'expirado';
                  return (
                    <li key={a.id} className={`central-linha${expirado ? ' expirado' : ''}`}>
                      <IconeDoArquivo arquivo={a} />
                      <div className="arq-principal">
                        <strong>{a.nome}</strong>
                        {a.descricao && <span className="arq-descricao">{a.descricao}</span>}
                        <small>{formatoDe(a)} · {tamanhoLegivel(a.tamanho)}</small>
                      </div>
                      <span className="central-dado"><small>Incluído em</small>{dataBr(a.criado_em)}</span>
                      <span className="central-dado"><small>Validade</small>{textoDaValidade(a)}</span>
                      <SeloSituacao situacao={a.situacao} />
                      <button type="button" className="btn" onClick={() => setVendo({ pop: p.id, arquivo: a.id })} disabled={expirado} title={expirado ? 'Arquivo expirado: não pode ser aberto' : undefined}
                        aria-label={`Visualizar ${a.nome}`}><Icone nome="olho" tamanho={16} />Visualizar</button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </article>
      ))}

      {aberto && vendo && (
        <VisualizadorDeArquivo arquivos={aberto.arquivos.filter((a) => a.situacao !== 'expirado')} inicial={vendo.arquivo} abrir={(arquivoId) => abrirArquivo(aberto.id, arquivoId)} aoFechar={() => setVendo(null)} />
      )}
    </section>
  );
}
