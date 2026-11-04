'use client';
import { useEffect, useRef, useState } from 'react';
import { Icone } from '@/components/Icone';
import { ORDEM_RELACOES, RELACOES, TIPOS_DOC, type Doc, type Relacao, type ResultadoBusca, type TipoDoc } from '@/lib/referencias';
import { buscarReferencias } from '@/lib/referencias-cliente';

// Diálogo "Adicionar referência" (decisão 35): busca por nome, identificação ou código, filtro
// POP/Processo, tipo de relação, e a lista para escolher o destino.

export function SeletorReferencia({ excluir, aoEscolher, aoFechar }: {
  excluir?: Doc | null;
  aoEscolher: (r: ResultadoBusca, relacao: Relacao) => void;
  aoFechar: () => void;
}) {
  const [q, setQ] = useState('');
  const [tipo, setTipo] = useState<TipoDoc | 'todos'>('todos');
  const [relacao, setRelacao] = useState<Relacao>('proxima');
  const [itens, setItens] = useState<ResultadoBusca[] | null>(null);
  const [erro, setErro] = useState('');
  const [marcado, setMarcado] = useState(0);
  const pedido = useRef(0);

  useEffect(() => {
    const n = ++pedido.current;
    const t = setTimeout(() => {
      buscarReferencias(q, excluir)
        .then((r) => { if (n === pedido.current) { setItens(r); setMarcado(0); setErro(''); } })
        .catch(() => { if (n === pedido.current) setErro('Não foi possível buscar agora.'); });
    }, q ? 200 : 0);
    return () => clearTimeout(t);
  }, [q, excluir]);

  const lista = (itens ?? []).filter((x) => tipo === 'todos' || x.tipo === tipo);

  function tecla(e: React.KeyboardEvent) {
    if (e.key === 'Escape') { e.preventDefault(); aoFechar(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setMarcado((m) => Math.min(lista.length - 1, m + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setMarcado((m) => Math.max(0, m - 1)); }
    else if (e.key === 'Enter' && lista[marcado]) { e.preventDefault(); aoEscolher(lista[marcado], relacao); }
  }

  return (
    <div className="overlay" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) aoFechar(); }}>
      <div className="dialog dialog-lg seletor-ref" role="dialog" aria-modal="true" aria-labelledby="ref-titulo" onKeyDown={tecla}>
        <h2 id="ref-titulo">Adicionar referência</h2>
        <p className="notice">Cite outro POP ou processo: o leitor vê a referência no texto e, na página pública, clica para abrir o documento.</p>

        <div className="seletor-ref-relacao" role="radiogroup" aria-label="Tipo de relação">
          {ORDEM_RELACOES.map((k) => (
            <button key={k} type="button" role="radio" aria-checked={relacao === k} className={`ref-opcao rel-${k}`} onClick={() => setRelacao(k)}>
              {RELACOES[k].seta} {RELACOES[k].rotulo}
            </button>
          ))}
        </div>

        <div className="seletor-ref-busca">
          <label className="search">
            <Icone nome="busca" tamanho={18} />
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nome, identificação ou código do POP ou do processo" aria-label="Buscar POP ou processo" />
          </label>
          <div className="segmented" role="tablist" aria-label="Tipo de documento">
            {(['todos', 'pop', 'processo'] as const).map((t) => (
              <button key={t} type="button" role="tab" aria-selected={tipo === t} onClick={() => { setTipo(t); setMarcado(0); }}>
                {t === 'todos' ? 'Todos' : t === 'pop' ? 'POPs' : 'Processos'}
              </button>
            ))}
          </div>
        </div>

        <div className="seletor-ref-lista" role="listbox" aria-label="Resultados">
          {erro && <p className="form-erro" role="alert">{erro}</p>}
          {!erro && itens === null && <p className="notice">Buscando…</p>}
          {!erro && itens !== null && lista.length === 0 && <p className="notice">Nada encontrado{q ? ` para “${q}”` : ''}.</p>}
          {lista.map((x, i) => (
            <button key={`${x.tipo}:${x.id}`} type="button" role="option" aria-selected={i === marcado} className={`seletor-ref-item${i === marcado ? ' marcado' : ''}`}
              onMouseEnter={() => setMarcado(i)} onClick={() => aoEscolher(x, relacao)}>
              <span className={`ref-tipo tipo-${x.tipo}`}>{TIPOS_DOC[x.tipo]}</span>
              <span className="seletor-ref-texto">
                <strong>{x.tipo === 'pop' ? (x.identificacao || x.codigo) : x.codigo} · {x.nome}</strong>
                {x.onde && <span>{x.onde}</span>}
              </span>
              <span className={`ref-previa rel-${relacao}`}>{RELACOES[relacao].seta} {RELACOES[relacao].rotulo}</span>
            </button>
          ))}
        </div>

        <div className="dialog-actions">
          <button type="button" className="btn" onClick={aoFechar}>Cancelar</button>
        </div>
      </div>
    </div>
  );
}
