'use client';
import { useEffect, useRef, useState } from 'react';
import { Icone } from '@/components/Icone';
import { normalizarHtml } from '@/lib/pop/texto-rico';
import { melhorarTextoComIa, type PedidoMelhoria, type SugestaoIa } from '@/lib/pops';

// Botão de IA ao lado do texto (passo ou objetivo): pede a revisão, mostra o antes e a sugestão
// lado a lado e só troca o texto se a pessoa escolher "Usar sugestão" (decisão 30).

type Estado = { fase: 'carregando' } | { fase: 'pronto'; sugestao: SugestaoIa } | { fase: 'erro'; mensagem: string };

const NOME_MODELO: Record<string, string> = { 'openai/gpt-oss-120b': 'GPT-OSS 120B', 'openai/gpt-oss-20b': 'GPT-OSS 20B (reserva)' };

export function MelhorarComIa({ pedido, aoAplicar, vazio, variante = 'icone', rotulo }: {
  /** Monta o pedido na hora do clique (com o texto atual). */
  pedido: () => PedidoMelhoria;
  aoAplicar: (texto: string) => void;
  vazio: boolean;
  variante?: 'icone' | 'botao';
  rotulo: string;
}) {
  const [aberto, setAberto] = useState<{ original: string } | null>(null);
  const [estado, setEstado] = useState<Estado>({ fase: 'carregando' });
  // Cada pedido ganha um número: resposta que chega depois de fechar ou de "Gerar outra" é ignorada.
  const vez = useRef(0);

  async function pedir(p = pedido()) {
    const minha = ++vez.current;
    setEstado({ fase: 'carregando' });
    let novo: Estado;
    try {
      novo = { fase: 'pronto', sugestao: await melhorarTextoComIa(p) };
    } catch (e) {
      novo = { fase: 'erro', mensagem: e instanceof Error ? e.message : 'A IA não respondeu agora. Tente de novo.' };
    }
    if (minha === vez.current) setEstado(novo);
  }

  function abrir() {
    const p = pedido();
    setAberto({ original: p.texto });
    void pedir(p);
  }

  function fechar() {
    vez.current++;
    setAberto(null);
  }

  // Esc fecha (mesmo enquanto a IA revisa); os atalhos da tela por baixo não recebem a tecla.
  useEffect(() => {
    if (!aberto) return;
    const tecla = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      e.preventDefault();
      vez.current++;
      setAberto(null);
    };
    window.addEventListener('keydown', tecla, true);
    return () => window.removeEventListener('keydown', tecla, true);
  }, [aberto]);

  const titulo = vazio ? 'Escreva o texto para a IA revisar' : `Melhorar com IA: ${rotulo}`;
  return (
    <>
      <button type="button" className={variante === 'icone' ? 'btn btn-ghost btn-icon btn-ia' : 'btn btn-ghost btn-ia'} onClick={abrir} disabled={vazio}
        title={titulo} aria-label={titulo}>
        <Icone nome="ia" tamanho={variante === 'icone' ? 18 : 16} />{variante === 'botao' && 'Melhorar com IA'}
      </button>

      {aberto && (
        <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="ia-titulo" onClick={() => estado.fase !== 'carregando' && fechar()}>
          <div className="dialog dialog-lg dialogo-ia" onClick={(e) => e.stopPropagation()}>
            <div className="ia-cabecalho">
              <span className="ia-selo"><Icone nome="ia" tamanho={18} /></span>
              <div>
                <h2 id="ia-titulo">Sugestão da IA · {rotulo}</h2>
                <p className="notice">Corrige e deixa o texto mais claro, sem inventar informação. Confira antes de usar.</p>
              </div>
              <button type="button" className="btn btn-ghost btn-icon dialog-fechar" onClick={fechar} title="Fechar (Esc)" aria-label="Fechar">
                <Icone nome="fechar" tamanho={20} />
              </button>
            </div>

            {estado.fase === 'carregando' && <p className="form-etapa"><span className="spinner" />Revisando o texto…</p>}

            {estado.fase === 'erro' && (
              <>
                <p className="form-erro" role="alert">{estado.mensagem}</p>
                <div className="dialog-actions">
                  <button type="button" className="btn" onClick={fechar}>Fechar</button>
                  <button type="button" className="btn btn-primary" onClick={() => void pedir()}>Tentar de novo</button>
                </div>
              </>
            )}

            {estado.fase === 'pronto' && (
              <>
                {estado.sugestao.igual ? (
                  <p className="aviso">O texto já está bom: a IA não sugeriu mudanças.</p>
                ) : (
                  <div className="ia-comparacao">
                    <div>
                      <span className="ia-rotulo">Antes</span>
                      {/* HTML passado pelo filtro do editor: só as tags e cores permitidas */}
                      <div className="ia-texto" dangerouslySetInnerHTML={{ __html: normalizarHtml(aberto.original) }} />
                    </div>
                    <div>
                      <span className="ia-rotulo ia-rotulo-novo">Sugestão</span>
                      <div className="ia-texto ia-texto-novo" dangerouslySetInnerHTML={{ __html: normalizarHtml(estado.sugestao.texto) }} />
                    </div>
                  </div>
                )}
                {estado.sugestao.mudancas.length > 0 && (
                  <div className="ia-mudancas">
                    <span className="ia-rotulo">O que mudou</span>
                    <ul>{estado.sugestao.mudancas.map((m, i) => <li key={i}>{m}</li>)}</ul>
                  </div>
                )}
                <div className="dialog-actions ia-acoes">
                  <span className="notice">{NOME_MODELO[estado.sugestao.modelo] ?? estado.sugestao.modelo} · Groq</span>
                  <button type="button" className="btn btn-ghost" onClick={() => void pedir()}>Gerar outra</button>
                  <button type="button" className="btn" onClick={fechar}>{estado.sugestao.igual ? 'Fechar' : 'Manter o meu'}</button>
                  {!estado.sugestao.igual && (
                    <button type="button" className="btn btn-primary" autoFocus onClick={() => { aoAplicar(estado.sugestao.texto); fechar(); }}>
                      <Icone nome="check" tamanho={16} />Usar sugestão
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
