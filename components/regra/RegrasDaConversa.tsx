'use client';
import { useEffect, useState } from 'react';
import { TIPOS_REGRA, type TipoRegra } from '@/lib/entrevista/topicos';
import { listarRegras, type Regra } from '@/lib/regras';

// As regras que saíram de uma conversa, organizadas por tipo (decisão 109): o que a pessoa vê no resultado da
// entrevista de regras, além da descrição geral. Mostra as que estão em revisão e as já confirmadas; as descartadas
// por quem revisa não aparecem.

const TITULO: Record<TipoRegra, string> = { negocio: 'Regras de negócio', comportamento: 'Regras de comportamento', definicao: 'Definições' };

export function RegrasDaConversa({ processoId, entrevistaId }: { processoId: string; entrevistaId: string }) {
  const [regras, setRegras] = useState<Regra[] | null>(null);
  useEffect(() => {
    listarRegras(processoId).then((d) => setRegras(d.regras.filter((r) => r.entrevista?.id === entrevistaId))).catch(() => setRegras([]));
  }, [processoId, entrevistaId]);
  if (!regras?.length) return null;
  return (
    <div className="regras-conversa-lista">
      {TIPOS_REGRA.map((t) => {
        // As confirmadas primeiro, na ordem do código; depois as que ainda estão em revisão.
        const doTipo = regras.filter((r) => r.tipo === t.id).sort((x, y) => (x.codigo ? 0 : 1) - (y.codigo ? 0 : 1) || x.codigo.localeCompare(y.codigo));
        if (!doTipo.length) return null;
        return (
          <section key={t.id} aria-label={TITULO[t.id]}>
            <h4 className="ficha-subtitulo">{TITULO[t.id]}<small>{doTipo.length}</small></h4>
            <ul>
              {doTipo.map((r) => (
                <li key={r.id}>
                  {r.situacao === 'confirmada'
                    ? <span className={`regra-codigo codigo-${r.tipo}`}>{r.codigo}</span>
                    : <span className="regra-codigo codigo-revisao">{r.ajuste ? 'Ajuste pedido' : 'Em revisão'}</span>}
                  <div>
                    <p>{r.texto}</p>
                    {r.pop && <span className="regra-meta">Aplica-se a: {r.pop.rotulo}</span>}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
