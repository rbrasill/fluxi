'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Icone } from '@/components/Icone';
import { listar as listarFluxogramas, type FluxogramaResumo } from '@/lib/fluxogramas';
import type { ConteudoPop, Historico, Passo } from '@/lib/pop/schema';
import { obterPop, salvarPop, urlDocx, type Pop } from '@/lib/pops';

type Status = 'salvo' | 'alterado' | 'salvando' | 'erro';

function mover<T>(lista: T[], de: number, para: number) {
  if (para < 0 || para >= lista.length) return lista;
  const nova = [...lista];
  const [item] = nova.splice(de, 1);
  nova.splice(para, 0, item);
  return nova;
}

export default function EditorPop() {
  const { id } = useParams<{ id: string }>();
  const [pop, setPop] = useState<Pop | null | undefined>(undefined);
  const [status, setStatus] = useState<Status>('salvo');
  const [fluxogramas, setFluxogramas] = useState<FluxogramaResumo[]>([]);
  const pendente = useRef<Partial<Pop>>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    obterPop(id).then(setPop).catch(() => setPop(null));
    listarFluxogramas().then(setFluxogramas).catch(() => {});
  }, [id]);

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

  async function baixar() {
    if (timer.current) clearTimeout(timer.current);
    await enviar();
    window.location.href = urlDocx(id);
  }

  const textoStatus = { salvo: 'Tudo salvo', alterado: 'Alterações não salvas', salvando: 'Salvando…', erro: 'Erro ao salvar. Tentando de novo ao editar.' }[status];

  return (
    <div className="page page-pop">
      <div className="page-head">
        <div>
          <Link href={pop.processo_id ? `/app/processos/${pop.processo_id}` : '/app/pops'} className="voltar"><Icone nome="voltar" tamanho={16} />{pop.processo_id ? 'Processo' : 'POPs'}</Link>
          <input className="titulo-editavel" value={pop.nome} onChange={(e) => alterar({ nome: e.target.value })} aria-label="Nome do procedimento" />
          <p className="status-linha"><span className={`dot ${status === 'salvo' ? '' : status === 'erro' ? 'error' : 'saving'}`} />{textoStatus}</p>
        </div>
        <div className="actions">
          <button className="btn btn-primary" onClick={baixar}><Icone nome="baixar" tamanho={16} />Baixar DOCX</button>
        </div>
      </div>

      <section className="cartao pop-sec">
        <h2>Procedimento</h2>
        <div className="grade-3">
          <label className="field">Área<input value={c.area} onChange={(e) => setConteudo({ area: e.target.value })} placeholder="Ex.: Comercial" /></label>
          <label className="field">Identificação POP<input value={pop.identificacao} onChange={(e) => alterar({ identificacao: e.target.value.toUpperCase() })} placeholder="Ex.: COME-001" /></label>
          <label className="field">Versão<input value={pop.versao} onChange={(e) => alterar({ versao: e.target.value })} /></label>
          <label className="field">Código do processo<input value={pop.codigo} readOnly className="somente-leitura" /></label>
          <label className="field">Data de criação<input value={new Date(pop.criado_em).toLocaleDateString('pt-BR')} readOnly className="somente-leitura" /></label>
          <label className="field">Executor do processo<input value={c.executor} onChange={(e) => setConteudo({ executor: e.target.value })} placeholder="Ex.: Analista Comercial" /></label>
        </div>
      </section>

      <section className="cartao pop-sec">
        <h2>Objetivo do processo</h2>
        <textarea rows={3} value={c.objetivo} onChange={(e) => setConteudo({ objetivo: e.target.value })} placeholder="Para que serve este procedimento e qual resultado ele garante." />
      </section>

      <section className="cartao pop-sec">
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

      <section className="cartao pop-sec">
        <h2>Recursos do processo</h2>
        <label className="field">
          Fluxograma
          <select value={pop.fluxograma_id ?? ''} onChange={(e) => alterar({ fluxograma_id: e.target.value || null })}>
            <option value="">Nenhum</option>
            {fluxogramas.map((f) => <option key={f.id} value={f.id}>{f.nome} ({f.codigo})</option>)}
          </select>
        </label>
        {pop.fluxograma_id && <Link href={`/app/fluxogramas/${pop.fluxograma_id}`} className="link-sec">Abrir diagrama</Link>}
      </section>

      <section className="pop-sec">
        <h2 className="titulo-solto">Procedimentos</h2>
        {c.procedimentos.map((p, i) => (
          <div key={i} className="cartao procedimento">
            <div className="proc-topo">
              <span className="num">{i + 1}</span>
              <input className="proc-nome" value={p.nome} onChange={(e) => setProc(i, { nome: e.target.value })} placeholder="Nome do procedimento" aria-label="Nome do procedimento" />
              <button className="btn btn-ghost btn-icon" aria-label="Subir procedimento" disabled={i === 0} onClick={() => setConteudo({ procedimentos: mover(c.procedimentos, i, i - 1) })}>↑</button>
              <button className="btn btn-ghost btn-icon" aria-label="Descer procedimento" disabled={i === c.procedimentos.length - 1} onClick={() => setConteudo({ procedimentos: mover(c.procedimentos, i, i + 1) })}>↓</button>
              <button className="btn btn-ghost btn-icon" aria-label="Excluir procedimento" onClick={() => confirm('Excluir este procedimento e seus passos?') && setConteudo({ procedimentos: c.procedimentos.filter((_, j) => j !== i) })}><Icone nome="lixo" tamanho={16} /></button>
            </div>
            {p.passos.map((s, k) => (
              <div key={k} className="passo">
                <span className="passo-num">{k + 1}</span>
                <div className="passo-corpo">
                  <textarea rows={2} value={s.texto} onChange={(e) => setPasso(i, k, { texto: e.target.value })} placeholder="Descreva o passo (ex.: Clique em Nova proposta e preencha o CPF)." />
                  {s.imagem_caminho && (
                    <div className="passo-img">
                      {pop.imagens[s.imagem_caminho] ? <img src={pop.imagens[s.imagem_caminho]} alt={`Tela do passo ${k + 1}`} /> : <span className="notice">Imagem da gravação</span>}
                      <button className="btn btn-ghost" onClick={() => setPasso(i, k, { imagem_caminho: undefined, imagem_largura: undefined, imagem_altura: undefined })}>Remover imagem</button>
                    </div>
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
            <button className="btn btn-tracejado" onClick={() => setProc(i, { passos: [...p.passos, { texto: '' }] })}><Icone nome="mais" tamanho={16} />Adicionar passo</button>
          </div>
        ))}
        <button className="btn" onClick={() => setConteudo({ procedimentos: [...c.procedimentos, { nome: '', passos: [{ texto: '' }] }] })}><Icone nome="mais" tamanho={16} />Adicionar procedimento</button>
      </section>

      <section className="cartao pop-sec">
        <h2>Históricos</h2>
        <div className="hist-cab"><span>Data</span><span>Elaborado por</span><span>Revisão</span><span /></div>
        {pop.historico.map((h, i) => (
          <div key={i} className="hist-linha">
            <input value={h.data} onChange={(e) => setHist(pop.historico.map((x, j) => (j === i ? { ...x, data: e.target.value } : x)))} aria-label="Data" />
            <input value={h.elaborado_por} onChange={(e) => setHist(pop.historico.map((x, j) => (j === i ? { ...x, elaborado_por: e.target.value } : x)))} placeholder="Nome" aria-label="Elaborado por" />
            <input value={h.revisao} onChange={(e) => setHist(pop.historico.map((x, j) => (j === i ? { ...x, revisao: e.target.value } : x)))} aria-label="Revisão" />
            <button className="btn btn-ghost btn-icon" aria-label="Remover" onClick={() => setHist(pop.historico.filter((_, j) => j !== i))}><Icone nome="lixo" tamanho={16} /></button>
          </div>
        ))}
        <button className="btn btn-tracejado" onClick={() => setHist([...pop.historico, { data: new Date().toLocaleDateString('pt-BR'), elaborado_por: '', revisao: `Rev. ${String(pop.historico.length + 1).padStart(2, '0')}` }])}><Icone nome="mais" tamanho={16} />Adicionar revisão</button>
      </section>
    </div>
  );
}
