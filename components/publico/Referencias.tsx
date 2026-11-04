'use client';
import { useEffect, useState } from 'react';
import { lerTexto, paraEditor, paraHtml } from '@/lib/pop/texto-rico';
import { RELACOES, SITUACAO, chaveRef, comOrigem, lerOrigemPublica, type Relacao } from '@/lib/referencias';
import { obterTituloPublico, type ReferenciaPublica } from '@/lib/publico';

// Referências nas páginas públicas (decisão 35): o chip do texto vira link para a página pública do
// destino, levando de onde a pessoa veio (?de=) para a página de destino oferecer o "Voltar".

export type Origem = { tipo: 'p' | 'pr'; link: string } | null;

const escapar = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** HTML do texto rico com cada referência como chip (link quando o destino tem página pública, mesmo fora do ar). */
export function htmlPublico(valor: string, refs: Record<string, ReferenciaPublica>, de: Origem) {
  return paraHtml(lerTexto(paraEditor(valor)), {
    referencia: (t) => {
      const r = refs[chaveRef(t.referencia)];
      const rel = RELACOES[t.referencia.relacao];
      const rotulo = r?.rotulo || t.texto;
      const situacao = r && r.situacao !== 'ok' ? SITUACAO[r.situacao] : '';
      const dentro = `<span class="ref-rel">${rel.seta} ${escapar(rel.rotulo)}</span><span class="ref-doc">${escapar(rotulo)}</span>${situacao ? '<span class="ref-situacao"></span>' : ''}`;
      const classe = `ref-chip rel-${t.referencia.relacao}${situacao ? ' indisponivel' : ''}`;
      const titulo = escapar(situacao ? `${rotulo} (${situacao})` : rotulo);
      if (!r?.url_publica) return `<span class="${classe}" title="${titulo}">${dentro}</span>`;
      return `<a class="${classe}" href="${escapar(comOrigem(r.url_publica, de))}" title="${titulo}">${dentro}</a>`;
    },
  });
}

/** Texto rico da página pública, com as referências clicáveis. */
export function RicoPublico({ valor, refs, de }: { valor: string; refs: Record<string, ReferenciaPublica>; de: Origem }) {
  return <div className="pub-texto" dangerouslySetInnerHTML={{ __html: htmlPublico(valor, refs, de) }} />;
}

/** Lista "Referenciado em": quem cita este documento, com a relação vista do lado dele. */
export function ReferenciadoEm<T extends ReferenciaPublica & { relacoes: Relacao[] }>({ itens, href, titulo = 'Referenciado em', aviso }: {
  itens: T[];
  href: (x: T) => string | null;
  titulo?: string;
  aviso?: string;
}) {
  if (!itens.length) return null;
  return (
    <>
      {aviso && <p className="notice">{aviso}</p>}
      <ul className="ref-lista" aria-label={titulo}>
        {itens.map((x) => {
          const url = href(x);
          const situacao = x.situacao !== 'ok' ? SITUACAO[x.situacao] : '';
          const dentro = (
            <>
              {x.relacoes.map((r) => <span key={r} className={`ref-rel-chip rel-${r}`}>{RELACOES[r].inverso}</span>)}
              <strong>{x.rotulo}</strong>
              {situacao && <span className="ref-origem-situacao">{situacao}</span>}
            </>
          );
          return (
            <li key={`${x.tipo}:${x.id}`}>
              {url ? <a className="ref-origem" href={url}>{dentro}</a> : <span className="ref-origem">{dentro}</span>}
            </li>
          );
        })}
      </ul>
    </>
  );
}

/** "← Voltar para POP MKT-001 · Nome", quando a pessoa chegou por uma referência (?de=) e a origem está no ar. */
export function VoltarPara({ de }: { de: string | null }) {
  const [origem, setOrigem] = useState<{ titulo: string; url: string } | null>(null);
  useEffect(() => {
    const o = lerOrigemPublica(de);
    if (!o) { setOrigem(null); return; }
    let viva = true;
    obterTituloPublico(`${o.tipo}:${o.link}`).then((r) => { if (viva) setOrigem(r); }).catch(() => { if (viva) setOrigem(null); });
    return () => { viva = false; };
  }, [de]);
  if (!origem) return null;
  return <a className="pub-voltar" href={origem.url}><span aria-hidden="true">←</span> Voltar para {origem.titulo}</a>;
}
