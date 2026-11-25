'use client';
import { useEffect, useRef, useState } from 'react';
import { Icone } from '@/components/Icone';
import { lerVersao, MAX_O_QUE_MUDOU, MIN_O_QUE_MUDOU, proximaVersao, textoDaVersao, TIPOS_POR_DOCUMENTO, type DocumentoVersionado, type PedidoDePublicacao, type TipoDeAlteracao } from '@/lib/versao';

// Janela de publicar o POP ou o processo (decisões 138 e 139). Na primeira publicação só confirma: sai a versão
// 1.0.0. Nas seguintes, a pessoa escolhe o tamanho da alteração (que define o número da versão) e escreve o que
// mudou, com tamanho mínimo. As palavras das opções são as de cada documento.

const TEXTOS: Record<DocumentoVersionado, { o: string; titulo: string; exemplo: string; onde: string }> = {
  pop: { o: 'o POP', titulo: 'Publicar o POP', exemplo: 'Ex.: Incluído o passo de conferir o telefone do cliente.', onde: 'Aparece na aba Versões, no PDF e na página pública.' },
  processo: { o: 'o processo', titulo: 'Publicar o processo', exemplo: 'Ex.: Incluída a etapa de aprovação da diretoria no fluxograma.', onde: 'Aparece na aba Versões.' },
};

export function PublicarVersao({ documento, atual, publicando, aoPublicar, aoFechar }: {
  documento: DocumentoVersionado;
  /** A versão publicada hoje ("1.2.0"); nula: nunca foi publicado. */
  atual: string | null;
  publicando: boolean;
  aoPublicar: (pedido: PedidoDePublicacao) => void;
  aoFechar: () => void;
}) {
  const numero = lerVersao(atual);
  const txt = TEXTOS[documento];
  const [tipo, setTipo] = useState<TipoDeAlteracao | null>(null);
  const [texto, setTexto] = useState('');
  const campo = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape' && !publicando) aoFechar(); };
    document.addEventListener('keydown', tecla);
    return () => document.removeEventListener('keydown', tecla);
  }, [aoFechar, publicando]);

  const fechar = <button type="button" className="btn btn-ghost btn-icon dialog-fechar" onClick={aoFechar} disabled={publicando} title="Fechar" aria-label="Fechar"><Icone nome="fechar" tamanho={18} /></button>;

  if (!numero) {
    return (
      <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="versao-titulo" onClick={() => !publicando && aoFechar()}>
        <div className="dialog versao-dialogo" onClick={(e) => e.stopPropagation()}>
          <div className="dialogo-topo">
            <div className="dialogo-topo-texto">
              <h2 id="versao-titulo">{txt.titulo}</h2>
              <p className="notice">Esta é a primeira publicação: {txt.o} sai como <b className="mono">versão 1.0.0</b>. Nas próximas, você escolhe o tamanho da alteração e diz o que mudou.</p>
            </div>
            {fechar}
          </div>
          <div className="dialog-actions">
            <button type="button" className="btn" onClick={aoFechar} disabled={publicando}>Cancelar</button>
            <button type="button" className="btn btn-primary" onClick={() => aoPublicar({})} disabled={publicando} autoFocus><Icone nome="check" tamanho={16} />{publicando ? 'Publicando…' : 'Publicar versão 1.0.0'}</button>
          </div>
        </div>
      </div>
    );
  }

  const limpo = texto.replace(/\s+/g, ' ').trim();
  const faltam = MIN_O_QUE_MUDOU - limpo.length;
  const nova = tipo ? textoDaVersao(proximaVersao(numero, tipo)) : null;
  const falta = !tipo ? 'Escolha o tamanho da alteração.' : faltam > 0 ? (limpo ? `Faltam ${faltam} ${faltam === 1 ? 'caractere' : 'caracteres'} em "O que mudou".` : 'Diga em uma frase o que mudou.') : '';
  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="versao-titulo" onClick={() => !publicando && aoFechar()}>
      <div className="dialog dialog-lg versao-dialogo" onClick={(e) => e.stopPropagation()}>
        <div className="dialogo-topo">
          <div className="dialogo-topo-texto">
            <h2 id="versao-titulo">Publicar nova versão</h2>
            <p className="notice">A versão publicada hoje é a <b className="mono">{atual}</b>. Escolha o tamanho da alteração e diga o que mudou.</p>
          </div>
          {fechar}
        </div>
        <div className="versao-tipos" role="radiogroup" aria-label="Tamanho da alteração">
          {TIPOS_POR_DOCUMENTO[documento].map((t) => (
            <button key={t.id} type="button" className="versao-tipo" role="radio" aria-checked={tipo === t.id} disabled={publicando}
              onClick={() => { setTipo(t.id); campo.current?.focus(); }}>
              <span className="versao-tipo-topo">
                <span className="versao-radio" aria-hidden="true" />
                <strong>{t.nome}</strong>
                <span className="versao-tipo-versao mono">{atual} → {textoDaVersao(proximaVersao(numero, t.id))}</span>
              </span>
              <span className="versao-tipo-texto">{t.resumo}</span>
              <span className="versao-tipo-exemplo">{t.exemplo}</span>
            </button>
          ))}
        </div>
        <label className="field">O que mudou
          <textarea ref={campo} rows={3} maxLength={MAX_O_QUE_MUDOU} value={texto} onChange={(e) => setTexto(e.target.value)} disabled={publicando}
            placeholder={txt.exemplo} aria-describedby="versao-dica" />
          <small className="versao-dica" id="versao-dica">
            <span>Uma frase, com pelo menos {MIN_O_QUE_MUDOU} caracteres. {txt.onde}</span>
            <span className="versao-conta">{limpo.length}/{MAX_O_QUE_MUDOU}</span>
          </small>
        </label>
        <div className="versao-rodape">
          <p className="versao-resumo" role="status">{falta || <>Vai ser publicada a <b>versão {nova}</b>.</>}</p>
          <div className="dialog-actions">
            <button type="button" className="btn" onClick={aoFechar} disabled={publicando}>Cancelar</button>
            <button type="button" className="btn btn-primary" onClick={() => tipo && aoPublicar({ tipo, o_que_mudou: limpo })} disabled={publicando || !!falta}>
              <Icone nome="check" tamanho={16} />{publicando ? 'Publicando…' : nova ? `Publicar versão ${nova}` : 'Publicar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
