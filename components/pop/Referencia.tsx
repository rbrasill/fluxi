'use client';
import { Node, mergeAttributes } from '@tiptap/core';
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from '@tiptap/react';
import Link from 'next/link';
import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { Icone } from '@/components/Icone';
import { ORDEM_RELACOES, RELACOES, SITUACAO, chaveRef, lerRef, type Relacao, type ReferenciaResolvida, type TipoDoc } from '@/lib/referencias';

// Referência a outro POP ou processo dentro do texto rico (decisão 35). No HTML guardado fica
// <a data-ref="pop:<id>" data-rel="proxima">rótulo</a>; no editor é um chip que não se edita por
// dentro: clicar nele abre, troca o tipo de relação ou remove.

/** Destinos resolvidos (nome atual, situação, links), fornecidos pela página que tem o editor. */
export const ReferenciasContext = createContext<Record<string, ReferenciaResolvida>>({});

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    referencia: { inserirReferencia: (attrs: { tipo: TipoDoc; id: string; relacao: Relacao; rotulo: string }) => ReturnType };
  }
}

export const ReferenciaNode = Node.create({
  name: 'referencia',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  draggable: false,
  addAttributes() {
    return { tipo: { default: 'pop' }, id: { default: '' }, relacao: { default: 'consulta' }, rotulo: { default: '' } };
  },
  parseHTML() {
    return [{
      tag: 'a[data-ref]',
      getAttrs: (el) => {
        const r = lerRef(el.getAttribute('data-ref'), el.getAttribute('data-rel'));
        return r ? { ...r, rotulo: el.textContent ?? '' } : false;
      },
    }];
  },
  renderHTML({ node }) {
    const a = node.attrs as { tipo: TipoDoc; id: string; relacao: Relacao; rotulo: string };
    return ['a', mergeAttributes({ 'data-ref': `${a.tipo}:${a.id}`, 'data-rel': a.relacao }), a.rotulo];
  },
  renderText({ node }) {
    return String(node.attrs.rotulo ?? '');
  },
  addCommands() {
    return {
      inserirReferencia: (attrs) => ({ commands }) => commands.insertContent([{ type: this.name, attrs }, { type: 'text', text: ' ' }]),
    };
  },
  addNodeView() {
    return ReactNodeViewRenderer(ChipReferencia, { as: 'span' });
  },
});

function ChipReferencia({ node, updateAttributes, deleteNode, selected }: NodeViewProps) {
  const a = node.attrs as { tipo: TipoDoc; id: string; relacao: Relacao; rotulo: string };
  const resolvidas = useContext(ReferenciasContext);
  const r = resolvidas[chaveRef(a)];
  const [menu, setMenu] = useState(false);
  const caixa = useRef<HTMLSpanElement>(null);
  const rel = RELACOES[a.relacao];
  const rotulo = r?.rotulo || a.rotulo;
  const situacao = r && r.situacao !== 'ok' ? SITUACAO[r.situacao] : '';

  useEffect(() => {
    if (!menu) return;
    const fora = (e: MouseEvent) => { if (!caixa.current?.contains(e.target as globalThis.Node | null)) setMenu(false); };
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenu(false); };
    document.addEventListener('mousedown', fora);
    document.addEventListener('keydown', tecla);
    return () => { document.removeEventListener('mousedown', fora); document.removeEventListener('keydown', tecla); };
  }, [menu]);

  return (
    <NodeViewWrapper as="span" className="ref-caixa" ref={caixa}>
      <button
        type="button"
        className={`ref-chip rel-${a.relacao}${situacao ? ' indisponivel' : ''}${selected ? ' selecionado' : ''}`}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setMenu(!menu)}
        aria-haspopup="menu"
        aria-expanded={menu}
        title={situacao ? `${rotulo} (${situacao})` : rotulo}
      >
        <span className="ref-rel">{rel.seta} {rel.rotulo}</span>
        <span className="ref-doc">{rotulo}</span>
        {situacao && <span className="ref-situacao" aria-label={situacao} />}
      </button>
      {menu && (
        <span className="ref-menu" role="menu" aria-label="Referência">
          <span className="ref-menu-titulo">{rotulo}{situacao ? ` · ${situacao}` : ''}</span>
          <span className="ref-menu-grupo" role="group" aria-label="Tipo de relação">
            {ORDEM_RELACOES.map((k) => (
              <button key={k} type="button" role="menuitemradio" aria-checked={a.relacao === k} className={`ref-opcao rel-${k}`}
                onMouseDown={(e) => e.preventDefault()} onClick={() => { updateAttributes({ relacao: k }); setMenu(false); }}>
                {RELACOES[k].seta} {RELACOES[k].rotulo}
              </button>
            ))}
          </span>
          {r?.url_app && <Link href={r.url_app} target="_blank" rel="noopener" role="menuitem" className="ref-menu-item" onClick={() => setMenu(false)}><Icone nome="externo" tamanho={14} />Abrir numa nova aba</Link>}
          <button type="button" role="menuitem" className="ref-menu-item perigo" onMouseDown={(e) => e.preventDefault()} onClick={() => { setMenu(false); deleteNode(); }}>
            <Icone nome="lixo" tamanho={14} />Remover referência
          </button>
        </span>
      )}
    </NodeViewWrapper>
  );
}
