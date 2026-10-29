'use client';
import Highlight from '@tiptap/extension-highlight';
import { Color, TextStyle } from '@tiptap/extension-text-style';
import { EditorContent, useEditor, useEditorState } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { useEffect, useRef, useState } from 'react';
import { Icone } from '@/components/Icone';
import { CORES_MARCA_TEXTO, CORES_TEXTO, normalizarDoEditor, paraEditor } from '@/lib/pop/texto-rico';

// Campo de texto com formatação do POP (objetivo e passos). Só o que sai igual no DOCX e no PDF:
// negrito, itálico, sublinhado, tachado, cor, marca-texto e listas. Sem fonte, tamanho, títulos,
// links, imagens ou tabelas (o modelo do POP define esses). O valor é o HTML de lib/pop/texto-rico.ts.

const extensoes = [
  StarterKit.configure({
    heading: false, blockquote: false, code: false, codeBlock: false, horizontalRule: false,
    link: false, dropcursor: false, trailingNode: false,
  }),
  TextStyle,
  Color,
  Highlight.configure({ multicolor: true }),
];

type Menu = 'cor' | 'fundo' | null;

export function TextoRico({ valor, aoMudar, rotulo, placeholder, linhas = 2 }: {
  valor: string;
  aoMudar: (v: string) => void;
  rotulo: string;
  placeholder?: string;
  linhas?: number;
}) {
  const ultimo = useRef(valor); // o que o editor tem agora (último valor enviado ou recebido)
  const mudar = useRef(aoMudar);
  mudar.current = aoMudar; // o editor guarda os callbacks da criação: usa sempre o da última renderização
  const [ativo, setAtivo] = useState(false); // foco dentro do campo ou da barra
  const [menu, setMenu] = useState<Menu>(null);
  const caixa = useRef<HTMLDivElement>(null);

  const editor = useEditor({
    extensions: extensoes,
    content: paraEditor(valor),
    immediatelyRender: false,
    editorProps: { attributes: { class: 'tr-conteudo', role: 'textbox', 'aria-multiline': 'true', 'aria-label': rotulo } },
    onUpdate: ({ editor: e }) => {
      const v = normalizarDoEditor(e.getHTML());
      if (v === ultimo.current) return;
      ultimo.current = v;
      mudar.current(v);
    },
  });

  // O valor mudou por fora (ex.: o POP foi recarregado): atualiza o editor sem gerar alteração.
  useEffect(() => {
    if (!editor || valor === ultimo.current) return;
    ultimo.current = valor;
    editor.commands.setContent(paraEditor(valor), { emitUpdate: false });
  }, [editor, valor]);

  const estado = useEditorState({
    editor,
    selector: ({ editor: e }) => e && ({
      negrito: e.isActive('bold'),
      italico: e.isActive('italic'),
      sublinhado: e.isActive('underline'),
      tachado: e.isActive('strike'),
      marcadores: e.isActive('bulletList'),
      numerada: e.isActive('orderedList'),
      cor: (e.getAttributes('textStyle').color as string | undefined) ?? null,
      fundo: e.isActive('highlight') ? ((e.getAttributes('highlight').color as string | undefined) ?? CORES_MARCA_TEXTO[0].cor) : null,
      desfazer: e.can().undo(),
      refazer: e.can().redo(),
      vazio: e.isEmpty,
    }),
  });

  const cadeia = () => editor!.chain().focus();
  // Os botões não tiram o foco do texto (a seleção continua onde estava).
  const semPerderFoco = (e: React.MouseEvent) => e.preventDefault();
  const botao = (titulo: string, ativoAgora: boolean, acao: () => void, conteudo: React.ReactNode, desativado = false) => (
    <button type="button" className="tr-botao" title={titulo} aria-label={titulo} aria-pressed={ativoAgora} disabled={desativado}
      onMouseDown={semPerderFoco} onClick={() => { setMenu(null); acao(); }}>
      {conteudo}
    </button>
  );

  function aoSairDoFoco(e: React.FocusEvent) {
    if (caixa.current?.contains(e.relatedTarget as Node | null)) return;
    setAtivo(false);
    setMenu(null);
  }

  return (
    <div ref={caixa} className={`texto-rico ${ativo ? 'ativo' : ''}`} style={{ '--linhas': linhas } as React.CSSProperties}
      onFocus={() => setAtivo(true)} onBlur={aoSairDoFoco}
      onKeyDown={(e) => { if (e.key === 'Escape' && menu) { e.stopPropagation(); setMenu(null); editor?.commands.focus(); } }}>
      {ativo && editor && estado && (
        <div className="tr-barra" role="toolbar" aria-label={`Formatação: ${rotulo}`}>
          {botao('Negrito (Ctrl+B)', estado.negrito, () => cadeia().toggleBold().run(), <b>B</b>)}
          {botao('Itálico (Ctrl+I)', estado.italico, () => cadeia().toggleItalic().run(), <i>I</i>)}
          {botao('Sublinhado (Ctrl+U)', estado.sublinhado, () => cadeia().toggleUnderline().run(), <u>U</u>)}
          {botao('Tachado (Ctrl+Shift+S)', estado.tachado, () => cadeia().toggleStrike().run(), <s>S</s>)}
          <span className="tr-sep" />
          <div className="tr-grupo-menu">
            <button type="button" className="tr-botao" title="Cor do texto" aria-label="Cor do texto" aria-haspopup="true" aria-expanded={menu === 'cor'}
              onMouseDown={semPerderFoco} onClick={() => setMenu(menu === 'cor' ? null : 'cor')}>
              <span className="tr-letra-cor" style={{ borderColor: estado.cor ?? 'currentColor' }}>A</span><Icone nome="seta-baixo" tamanho={10} />
            </button>
            {menu === 'cor' && (
              <div className="tr-paleta" role="menu" aria-label="Cor do texto">
                <button type="button" role="menuitem" className="tr-cor-auto" onMouseDown={semPerderFoco} onClick={() => { setMenu(null); cadeia().unsetColor().run(); }}>Automática</button>
                {CORES_TEXTO.map((c) => (
                  <button key={c.cor} type="button" role="menuitem" className="tr-amostra" style={{ background: c.cor }} title={c.nome} aria-label={c.nome}
                    aria-pressed={estado.cor?.toUpperCase() === c.cor} onMouseDown={semPerderFoco} onClick={() => { setMenu(null); cadeia().setColor(c.cor).run(); }} />
                ))}
              </div>
            )}
          </div>
          <div className="tr-grupo-menu">
            <button type="button" className="tr-botao" title="Marca-texto" aria-label="Marca-texto" aria-haspopup="true" aria-expanded={menu === 'fundo'}
              onMouseDown={semPerderFoco} onClick={() => setMenu(menu === 'fundo' ? null : 'fundo')}>
              <span className="tr-marca" style={{ background: estado.fundo ?? CORES_MARCA_TEXTO[0].cor }}><Icone nome="marca-texto" tamanho={14} /></span><Icone nome="seta-baixo" tamanho={10} />
            </button>
            {menu === 'fundo' && (
              <div className="tr-paleta" role="menu" aria-label="Marca-texto">
                <button type="button" role="menuitem" className="tr-cor-auto" onMouseDown={semPerderFoco} onClick={() => { setMenu(null); cadeia().unsetHighlight().run(); }}>Nenhum</button>
                {CORES_MARCA_TEXTO.map((c) => (
                  <button key={c.cor} type="button" role="menuitem" className="tr-amostra" style={{ background: c.cor }} title={c.nome} aria-label={c.nome}
                    aria-pressed={estado.fundo?.toUpperCase() === c.cor} onMouseDown={semPerderFoco} onClick={() => { setMenu(null); cadeia().setHighlight({ color: c.cor }).run(); }} />
                ))}
              </div>
            )}
          </div>
          <span className="tr-sep" />
          {botao('Lista com marcadores', estado.marcadores, () => cadeia().toggleBulletList().run(), <Icone nome="lista" tamanho={16} />)}
          {botao('Lista numerada', estado.numerada, () => cadeia().toggleOrderedList().run(), <Icone nome="lista-numerada" tamanho={16} />)}
          <span className="tr-sep" />
          {botao('Limpar formatação', false, () => cadeia().unsetAllMarks().run(), <Icone nome="limpar-formato" tamanho={16} />)}
          {botao('Desfazer (Ctrl+Z)', false, () => cadeia().undo().run(), <Icone nome="desfazer" tamanho={16} />, !estado.desfazer)}
          {botao('Refazer (Ctrl+Shift+Z)', false, () => cadeia().redo().run(), <Icone nome="refazer" tamanho={16} />, !estado.refazer)}
        </div>
      )}
      <EditorContent editor={editor} />
      {placeholder && (estado?.vazio ?? !valor) && <span className="tr-placeholder" aria-hidden="true">{placeholder}</span>}
    </div>
  );
}
