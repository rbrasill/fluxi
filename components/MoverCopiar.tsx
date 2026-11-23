'use client';
import { useEffect, useMemo, useState } from 'react';
import { Icone } from '@/components/Icone';
import { listarAreas, type AreaResumo } from '@/lib/areas';
import { copiarPop, listarPops, moverPop, type OndePop, type PopResumo } from '@/lib/pops';
import { atualizarProcesso, copiarProcesso, listarProcessos, type ProcessoResumo } from '@/lib/processos';

// "Mover ou copiar" (decisão 36). POP: para outro processo. Processo: para outra área. Mover leva o
// item como está; copiar cria um novo (POP como rascunho, com os prints; processo com a descrição,
// o fluxograma e cópias dos POPs ativos). Gravações de tela e páginas públicas nunca vão na cópia.
// O destino se escolhe em etapas (decisão 103): organização, área e processo, cada campo só com o que pertence à
// escolha anterior; no fim, a lista do que já está no destino. Para um processo, só organização e área.

export type Acao = 'mover' | 'copiar';
type Pop = { tipo: 'pop'; id: string; nome: string; identificacao?: string | null; processo: OndePop };
type Processo = { tipo: 'processo'; id: string; nome: string; area_id: string | null; totais: { pops: number; gravacoes: number; fluxograma: boolean } };
const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

export function MoverCopiar({ item, acaoInicial = 'mover', aoConcluir, aoFechar }: {
  item: Pop | Processo;
  acaoInicial?: Acao;
  /** mover: o id do próprio item; copiar: o id da cópia. */
  aoConcluir: (r: { acao: Acao; id: string }) => void;
  aoFechar: () => void;
}) {
  const [acao, setAcao] = useState<Acao>(acaoInicial);
  const [orgId, setOrgId] = useState('');
  const [areaId, setAreaId] = useState('');
  const [destino, setDestino] = useState(''); // o POP vai para um processo; o processo vai para uma área
  const [nome, setNome] = useState(item.nome);
  const [areas, setAreas] = useState<AreaResumo[] | null>(null);
  const [processos, setProcessos] = useState<ProcessoResumo[] | null>(null);
  const [pops, setPops] = useState<PopResumo[] | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');
  const pop = item.tipo === 'pop' ? item : null;
  const processo = item.tipo === 'processo' ? item : null;
  const atual = pop ? pop.processo?.id ?? null : processo!.area_id;

  useEffect(() => {
    // As áreas formam os dois primeiros passos; os processos (e, para o POP, os POPs) alimentam o fim da lista.
    Promise.all([listarAreas(), listarProcessos(), pop ? listarPops() : Promise.resolve([] as PopResumo[])])
      .then(([a, p, o]) => { setAreas(a); setProcessos(p); setPops(o); })
      .catch(() => { setAreas([]); setProcessos([]); setPops([]); setErro('Não foi possível carregar os destinos.'); });
  }, [pop]);

  const carregando = areas === null || processos === null || pops === null;
  const SEM_ORG = '_sem';
  const orgDaArea = (a: AreaResumo) => a.organizacao?.id ?? SEM_ORG;
  const organizacoes = useMemo(() => {
    const m = new Map<string, { id: string; nome: string; areas: number }>();
    for (const a of areas ?? []) {
      const id = orgDaArea(a);
      m.set(id, { id, nome: a.organizacao?.nome ?? 'Sem organização', areas: (m.get(id)?.areas ?? 0) + 1 });
    }
    return [...m.values()].sort((x, y) => x.nome.localeCompare(y.nome, 'pt-BR'));
  }, [areas]);
  const areasDaOrg = useMemo(() => (areas ?? []).filter((a) => orgDaArea(a) === orgId).sort((x, y) => x.nome.localeCompare(y.nome, 'pt-BR')), [areas, orgId]);
  const processosDaArea = useMemo(() => (processos ?? []).filter((x) => x.area_id === areaId).sort((x, y) => x.nome.localeCompare(y.nome, 'pt-BR')), [processos, areaId]);
  const popsDoProcesso = useMemo(() => (pops ?? []).filter((x) => x.processo_id === destino), [pops, destino]);
  const areaAtualDoPop = pop?.processo?.area?.id ?? null;
  const areaAtual = pop ? areaAtualDoPop : atual;
  const areaDoLocalAtual = (areas ?? []).find((a) => a.id === areaAtual);
  const orgAtual = areaDoLocalAtual ? orgDaArea(areaDoLocalAtual) : null;

  const processoEscolhido = pop ? processos?.find((x) => x.id === destino) ?? null : null;
  const areaEscolhida = processo ? areas?.find((x) => x.id === destino) ?? null : null;
  const escolhido = pop ? (processoEscolhido ? { id: processoEscolhido.id, nome: processoEscolhido.nome } : null) : areaEscolhida ? { id: areaEscolhida.id, nome: areaEscolhida.nome } : null;
  const mesmo = !!escolhido && escolhido.id === atual;

  function escolherOrg(id: string) { setOrgId(id); setAreaId(''); setDestino(''); setErro(''); }
  function escolherArea(id: string) { setAreaId(id); setDestino(processo ? id : ''); setErro(''); }

  // Mudar de ação: mover não aceita o destino atual; a cópia no mesmo lugar ganha "(cópia)" no nome.
  function mudarAcao(a: Acao) {
    setAcao(a);
    setErro('');
    if (a === 'mover' && destino === atual) { setDestino(''); if (processo) setAreaId(''); }
  }
  useEffect(() => { setNome(mesmo ? `${item.nome} (cópia)` : item.nome); }, [mesmo, item.nome]);

  async function confirmar(e: React.FormEvent) {
    e.preventDefault();
    if (!escolhido) return;
    setEnviando(true);
    setErro('');
    try {
      if (pop) {
        if (acao === 'mover') { await moverPop(pop.id, escolhido.id); aoConcluir({ acao, id: pop.id }); }
        else { const r = await copiarPop(pop.id, { processo_id: escolhido.id, nome: nome.trim() || undefined }); aoConcluir({ acao, id: r.id }); }
      } else {
        if (acao === 'mover') { await atualizarProcesso(processo!.id, { area_id: escolhido.id }); aoConcluir({ acao, id: processo!.id }); }
        else { const r = await copiarProcesso(processo!.id, { area_id: escolhido.id, nome: nome.trim() || undefined }); aoConcluir({ acao, id: r.id }); }
      }
    } catch (x) {
      setErro(x instanceof Error ? x.message : 'Não deu certo. Tente de novo.');
      setEnviando(false);
    }
  }

  const t = processo?.totais;
  const titulo = pop ? 'Mover ou copiar o POP' : 'Mover ou copiar o processo';
  const onde = pop
    ? (pop.processo ? <>está em <b>{[pop.processo.area?.organizacao?.nome, pop.processo.area?.nome].filter(Boolean).join(' · ')}</b> › processo <b>{pop.processo.nome}</b>.</> : <>não está em nenhum processo.</>)
    : <>está na área <b>{areas?.find((a) => a.id === processo!.area_id)?.nome ?? '…'}</b>.</>;

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="mover-copiar-titulo" onClick={() => !enviando && aoFechar()}>
      <form className="dialog mover-copiar" onClick={(e) => e.stopPropagation()} onSubmit={confirmar}>
        <h2 id="mover-copiar-titulo">{titulo}</h2>
        <p className="notice"><b>{item.nome}</b> {onde}</p>

        <div className="segmented" role="tablist" aria-label="O que fazer">
          <button type="button" role="tab" aria-selected={acao === 'mover'} onClick={() => mudarAcao('mover')} disabled={enviando}><Icone nome="mover" tamanho={16} />Mover</button>
          <button type="button" role="tab" aria-selected={acao === 'copiar'} onClick={() => mudarAcao('copiar')} disabled={enviando}><Icone nome="copiar" tamanho={16} />Copiar</button>
        </div>

        <fieldset className="mover-campos">
          <legend>{pop ? 'Para qual processo?' : 'Para qual área?'}</legend>
          <div className="mover-campo">
            <label htmlFor="mc-org" className="mover-passo-cab"><span className={`mover-num${orgId ? ' feito' : ''}`}>{orgId ? '✓' : 1}</span>Organização</label>
            <select id="mc-org" value={orgId} onChange={(e) => escolherOrg(e.target.value)} disabled={carregando || enviando} autoFocus>
              <option value="">{carregando ? 'Carregando…' : 'Escolha a organização…'}</option>
              {organizacoes.map((o) => <option key={o.id} value={o.id}>{o.nome}{o.id === orgAtual ? ' (atual)' : ''} · {plural(o.areas, 'área', 'áreas')}</option>)}
            </select>
          </div>
          <div className="mover-campo">
            <label htmlFor="mc-area" className="mover-passo-cab"><span className={`mover-num${areaId ? ' feito' : orgId ? '' : ' espera'}`}>{areaId ? '✓' : 2}</span>Área</label>
            <select id="mc-area" value={areaId} onChange={(e) => escolherArea(e.target.value)} disabled={!orgId || enviando}>
              <option value="">{orgId ? 'Escolha a área…' : 'Escolha a organização primeiro'}</option>
              {areasDaOrg.map((a) => (
                <option key={a.id} value={a.id} disabled={!!processo && acao === 'mover' && a.id === atual}>
                  {a.nome}{a.id === areaAtual ? ' (atual)' : ''} · {plural(a.total_processos, 'processo', 'processos')}
                </option>
              ))}
            </select>
          </div>
          {pop && (
            <div className="mover-campo">
              <label htmlFor="mc-proc" className="mover-passo-cab"><span className={`mover-num${destino ? ' feito' : areaId ? '' : ' espera'}`}>{destino ? '✓' : 3}</span>Processo</label>
              <select id="mc-proc" value={destino} onChange={(e) => { setDestino(e.target.value); setErro(''); }} disabled={!areaId || enviando} required>
                <option value="">{areaId ? (processosDaArea.length ? 'Escolha o processo…' : 'Esta área ainda não tem processos') : 'Escolha a área primeiro'}</option>
                {processosDaArea.map((x) => <option key={x.id} value={x.id} disabled={acao === 'mover' && x.id === atual}>{x.nome}{x.id === atual ? ' (atual)' : ''} · {plural(x.total.pops, 'POP', 'POPs')}</option>)}
              </select>
            </div>
          )}
          {escolhido && (
            <section className="mover-existentes" aria-label={pop ? 'POPs do processo escolhido' : 'Processos da área escolhida'}>
              <p className="mover-passo-cab"><span className="mover-num feito">{pop ? 4 : 3}</span>{pop ? 'POPs que já estão neste processo' : 'Processos que já estão nesta área'}</p>
              {pop
                ? (popsDoProcesso.length ? <ul>{popsDoProcesso.map((x) => <li key={x.id}><Icone nome="pop" tamanho={14} /><span>{x.nome}</span></li>)}</ul> : <p className="mover-vazio">Este processo ainda não tem POPs.</p>)
                : (processosDaArea.length ? <ul>{processosDaArea.map((x) => <li key={x.id}><Icone nome="processos" tamanho={14} /><span>{x.nome}</span></li>)}</ul> : <p className="mover-vazio">Esta área ainda não tem processos.</p>)}
            </section>
          )}
        </fieldset>

        {acao === 'copiar' && (
          <label className="field">
            Nome da cópia
            <input value={nome} onChange={(e) => setNome(e.target.value)} maxLength={200} disabled={enviando} required />
          </label>
        )}

        {escolhido && pop && acao === 'mover' && (
          <div className="mover-resumo">
            <p><Icone nome="mover" tamanho={14} /> O POP sai do processo atual e entra em <b>{escolhido.nome}</b>.</p>
            <ul>
              {processoEscolhido && <li>O código do processo no documento passa a ser <b>{processoEscolhido.codigo}</b>.</li>}
              {processoEscolhido?.area && <li>O campo “Área” passa a <b>{processoEscolhido.area.nome}</b>, se ainda estiver com a área antiga.</li>}
              <li>As gravações de tela vão junto. A página pública e o link continuam os mesmos.</li>
            </ul>
          </div>
        )}
        {escolhido && pop && acao === 'copiar' && (
          <div className="mover-resumo">
            <p><Icone nome="copiar" tamanho={14} /> Uma cópia entra em <b>{escolhido.nome}</b> como rascunho, com os textos, os prints e as referências.</p>
            <ul>
              {pop.identificacao && <li>A identificação continua <b>{pop.identificacao}</b>: ajuste na cópia se a área usa outra numeração.</li>}
              <li>Gravações de tela e a página pública não vão: a cópia tem link próprio e começa desligada do ar até ser publicada.</li>
            </ul>
          </div>
        )}
        {escolhido && processo && acao === 'mover' && (
          <div className="mover-resumo">
            <p><Icone nome="mover" tamanho={14} /> O processo vai inteiro para <b>{escolhido.nome}</b>{t && (t.pops || t.gravacoes || t.fluxograma) ? ', com:' : '.'}</p>
            {t && <ul>
              {t.pops > 0 && <li>{plural(t.pops, 'POP', 'POPs')} (o campo “Área” deles acompanha)</li>}
              {t.gravacoes > 0 && <li>{plural(t.gravacoes, 'gravação de tela', 'gravações de tela')}</li>}
              {t.fluxograma && <li>o fluxograma</li>}
            </ul>}
            <p className="mover-aviso">Os links públicos continuam os mesmos.</p>
          </div>
        )}
        {escolhido && processo && acao === 'copiar' && (
          <div className="mover-resumo">
            <p><Icone nome="copiar" tamanho={14} /> Uma cópia do processo entra em <b>{escolhido.nome}</b>{areaEscolhida?.organizacao ? <> ({areaEscolhida.organizacao.nome})</> : null}, com:</p>
            <ul>
              <li>a descrição</li>
              {t?.fluxograma && <li>o fluxograma</li>}
              {t && t.pops > 0 ? <li>cópias dos {plural(t.pops, 'POP ativo', 'POPs ativos')}, como rascunho, com os prints</li> : <li>nenhum POP (o processo não tem POP ativo)</li>}
            </ul>
            <p className="mover-aviso">Gravações de tela e páginas públicas não vão: a cópia tem links próprios.</p>
          </div>
        )}

        {erro && <p className="form-erro" role="alert">{erro}</p>}
        <div className="dialog-actions">
          <button type="button" className="btn" onClick={aoFechar} disabled={enviando}>Cancelar</button>
          <button type="submit" className="btn btn-primary" disabled={!escolhido || enviando || (acao === 'copiar' && !nome.trim())}>
            <Icone nome={acao === 'mover' ? 'mover' : 'copiar'} tamanho={16} />
            {enviando ? (acao === 'mover' ? 'Movendo…' : 'Copiando…') : acao === 'mover' ? (pop ? 'Mover o POP' : 'Mover o processo') : (pop ? 'Copiar o POP' : 'Copiar o processo')}
          </button>
        </div>
      </form>
    </div>
  );
}
