'use client';
import { useEffect, useMemo, useState } from 'react';
import { Icone } from '@/components/Icone';
import { listarAreas, porOrganizacao, type AreaResumo } from '@/lib/areas';
import { moverPop, type OndePop } from '@/lib/pops';
import { listarProcessos, type ProcessoResumo } from '@/lib/processos';

const NOVO = 'novo';
const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

/**
 * Move o POP para outra área. A área vem do processo, então o processo vai inteiro, com tudo o que
 * tem. POP solto (sem processo) entra num processo da área nova, existente ou criado aqui.
 */
export function MoverPop({ pop, aoMover, aoFechar }: {
  pop: { id: string; nome: string; processo: OndePop };
  aoMover: (r: { processo_id: string }) => void;
  aoFechar: () => void;
}) {
  const [areas, setAreas] = useState<AreaResumo[] | null>(null);
  const [processos, setProcessos] = useState<ProcessoResumo[]>([]);
  const [areaId, setAreaId] = useState('');
  const [destino, setDestino] = useState(NOVO);
  const [nomeNovo, setNomeNovo] = useState(pop.nome);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');

  useEffect(() => {
    Promise.all([listarAreas(), listarProcessos()])
      .then(([a, p]) => { setAreas(a); setProcessos(p); })
      .catch(() => { setAreas([]); setErro('Não foi possível carregar as áreas.'); });
  }, []);

  const origem = pop.processo;
  const areaAtual = origem?.area?.id ?? null;
  const area = areas?.find((a) => a.id === areaId);
  const daArea = useMemo(() => processos.filter((p) => p.area_id === areaId), [processos, areaId]);
  // Áreas agrupadas por organização, para o seletor.
  const grupos = useMemo(() => porOrganizacao(areas ?? []), [areas]);

  // O que vai junto com o processo.
  const t = processos.find((p) => p.id === origem?.id)?.total;
  const materiais = t ? [plural(t.pops, 'POP', 'POPs'), plural(t.gravacoes, 'gravação', 'gravações'), plural(t.fluxogramas, 'fluxograma', 'fluxogramas')] : [];
  const outros = t ? t.pops - 1 + t.gravacoes + t.fluxogramas : 0;

  function escolherArea(id: string) {
    setAreaId(id);
    setDestino(NOVO);
    setErro('');
  }

  async function confirmar(e: React.FormEvent) {
    e.preventDefault();
    if (!areaId) return;
    setEnviando(true);
    setErro('');
    try {
      aoMover(await moverPop(pop.id, origem
        ? { area_id: areaId }
        : { area_id: areaId, ...(destino === NOVO ? { novo_processo: nomeNovo.trim() || pop.nome } : { processo_id: destino }) }));
    } catch (x) {
      setErro(x instanceof Error ? x.message : 'Não foi possível mover o POP.');
      setEnviando(false);
    }
  }

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="mover-pop" onClick={() => !enviando && aoFechar()}>
      <form className="dialog mover-pop" onClick={(e) => e.stopPropagation()} onSubmit={confirmar}>
        <h2 id="mover-pop">Mover para outra área</h2>
        <p className="notice">
          <b>{pop.nome}</b> {origem
            ? <>está em {[origem.area?.organizacao?.nome, origem.area?.nome].filter(Boolean).join(' · ')} › processo <b>{origem.nome}</b>.</>
            : 'não está em nenhum processo.'}
        </p>

        <label className="field">
          Para qual área?
          <select value={areaId} onChange={(e) => escolherArea(e.target.value)} disabled={areas === null || enviando} required autoFocus>
            <option value="">{areas === null ? 'Carregando…' : 'Escolha a área…'}</option>
            {grupos.map(([org, lista]) => (
              <optgroup key={org} label={org}>
                {lista.map((a) => <option key={a.id} value={a.id} disabled={a.id === areaAtual}>{a.nome}{a.id === areaAtual ? ' (atual)' : ''}</option>)}
              </optgroup>
            ))}
          </select>
        </label>

        {area && origem && (
          <div className="mover-resumo">
            <p><Icone nome="pasta" tamanho={14} /> O processo <b>{origem.nome}</b> vai inteiro para <b>{area.nome}</b>{materiais.length ? ', com:' : '.'}</p>
            {materiais.length > 0 && <ul>{materiais.map((m) => <li key={m}>{m}</li>)}</ul>}
            {outros > 0 && <p className="mover-aviso">Tudo o que está no processo muda de área junto com este POP.</p>}
          </div>
        )}

        {area && !origem && (
          <>
            <label className="field">
              Em qual processo de {area.nome}?
              <select value={destino} onChange={(e) => setDestino(e.target.value)} disabled={enviando}>
                <option value={NOVO}>Novo processo…</option>
                {daArea.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
              </select>
            </label>
            {destino === NOVO && (
              <label className="field">
                Nome do processo novo
                <input value={nomeNovo} onChange={(e) => setNomeNovo(e.target.value)} maxLength={200} disabled={enviando} required />
              </label>
            )}
          </>
        )}

        {area && <p className="notice">O campo “Área” do documento passa a ser <b>{area.nome}</b> {origem ? '(se ainda estiver com o nome da área antiga)' : '(se estiver em branco)'}.</p>}

        {erro && <p className="form-erro" role="alert">{erro}</p>}
        <div className="dialog-actions">
          <button type="button" className="btn" onClick={aoFechar} disabled={enviando}>Cancelar</button>
          <button type="submit" className="btn btn-primary" disabled={!area || enviando || (!origem && destino === NOVO && !nomeNovo.trim())}>
            <Icone nome="mover" tamanho={16} />{enviando ? 'Movendo…' : origem ? 'Mover o processo' : 'Mover o POP'}
          </button>
        </div>
      </form>
    </div>
  );
}
