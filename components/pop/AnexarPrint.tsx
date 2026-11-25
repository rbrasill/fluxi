'use client';
import { useEffect, useRef, useState } from 'react';
import { Icone } from '@/components/Icone';
import { capturarTela, imagemColada, imagemParaPng, lerPrintDaAreaDeTransferencia, suportaCapturaDeTela, type Print } from '@/lib/gravacao/captura';
import { formatarTempo, type TelaDaGravacao } from '@/lib/gravacoes';

// Print para um passo do POP: uma tela marcada numa gravação do POP (quando há gravações), ou um
// print novo para a tela que faltou: capturar uma janela agora, colar ou escolher arquivo.
export function AnexarPrint({ titulo, aoAnexar, aoFechar, telasDaGravacao, aoEscolherTela }: {
  titulo: string;
  aoAnexar: (p: Print) => Promise<void>;
  aoFechar: () => void;
  /** Carrega as telas marcadas nas gravações do POP (só quando o POP tem gravações). */
  telasDaGravacao?: () => Promise<TelaDaGravacao[]>;
  aoEscolherTela?: (t: TelaDaGravacao) => void;
}) {
  const [previa, setPrevia] = useState<(Print & { url: string }) | null>(null);
  const [erro, setErro] = useState('');
  const [ocupado, setOcupado] = useState<'' | 'capturando' | 'anexando'>('');
  const [temCaptura, setTemCaptura] = useState(false);
  const [telas, setTelas] = useState<TelaDaGravacao[] | null>(null); // lista aberta
  const [carregandoTelas, setCarregandoTelas] = useState(false);
  const arquivo = useRef<HTMLInputElement>(null);
  const caixa = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setTemCaptura(suportaCapturaDeTela());
    caixa.current?.focus(); // Ctrl+V cai aqui
  }, []);
  useEffect(() => () => { if (previa) URL.revokeObjectURL(previa.url); }, [previa]);

  async function obter(fn: () => Promise<Print>) {
    setErro('');
    setOcupado('capturando');
    try {
      const p = await fn();
      setPrevia({ ...p, url: URL.createObjectURL(p.blob) });
    } catch (e) {
      if (e instanceof DOMException && e.name === 'NotAllowedError') setErro('A captura foi cancelada ou não foi permitida.');
      else setErro(e instanceof Error ? e.message : 'Não foi possível obter a imagem.');
    } finally {
      setOcupado('');
    }
  }

  async function abrirTelas() {
    if (!telasDaGravacao) return;
    setErro('');
    setCarregandoTelas(true);
    try { setTelas(await telasDaGravacao()); } catch { setErro('Não foi possível carregar as telas das gravações.'); } finally { setCarregandoTelas(false); }
  }

  async function usar() {
    if (!previa) return;
    setOcupado('anexando');
    try {
      await aoAnexar(previa);
    } catch {
      setErro('Não foi possível anexar o print. Tente de novo.');
      setOcupado('');
    }
  }

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="anexar-print anexar-print-passo" onClick={() => !ocupado && aoFechar()}>
      <div
        className={`dialog dialog-lg anexar${telasDaGravacao ? ' anexar-largo' : ''}`}
        ref={caixa}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        onPaste={(e) => {
          const f = imagemColada(e.nativeEvent);
          if (!f) return;
          e.preventDefault();
          e.stopPropagation();
          void obter(() => imagemParaPng(f));
        }}
      >
        <div className="dialogo-topo">
          <div className="dialogo-topo-texto">
            <h2 id="anexar-print">Anexar print</h2>
            <p className="notice" id="anexar-print-passo">{titulo}</p>
          </div>
          <button type="button" className="btn btn-ghost btn-icon dialog-fechar" onClick={aoFechar} disabled={!!ocupado} title="Fechar" aria-label="Fechar"><Icone nome="fechar" tamanho={18} /></button>
        </div>
        {telas ? (
          <>
            {telas.length === 0 && <p className="notice">Nenhuma tela marcada nas gravações deste POP.</p>}
            <div className="telas-grid telas-escolha">
              {telas.map((t) => (
                <button key={t.id} type="button" className="tela-mini" onClick={() => aoEscolherTela?.(t)} title={t.instrucao ?? ''}>
                  {(t.imagem_anotada_url ?? t.imagem_url) ? <img src={t.imagem_anotada_url ?? t.imagem_url!} alt="" /> : <span className="tela-sem-imagem">Imagem indisponível</span>}
                  <span className="tela-legenda"><span>{t.gravacao_nome}</span><span className="code">{formatarTempo(t.tempo_ms)}</span></span>
                </button>
              ))}
            </div>
            {erro && <p className="form-erro" role="alert">{erro}</p>}
            <div className="dialog-actions">
              <button className="btn" onClick={() => setTelas(null)}>Outro caminho</button>
              <button className="btn" onClick={aoFechar}>Cancelar</button>
            </div>
          </>
        ) : previa ? (
          <>
            <img src={previa.url} alt="Print capturado" className="anexar-previa" />
            <p className="notice">{previa.largura}×{previa.altura}. Depois de anexar, dá para marcar caixa, seta, número ou texto e recortar.</p>
            {erro && <p className="form-erro" role="alert">{erro}</p>}
            <div className="dialog-actions">
              <button className="btn" onClick={() => setPrevia(null)} disabled={ocupado === 'anexando'}>Outro print</button>
              <button className="btn btn-primary" onClick={usar} disabled={!!ocupado}><Icone nome="check" tamanho={16} />{ocupado === 'anexando' ? 'Anexando…' : 'Usar este print'}</button>
            </div>
          </>
        ) : (
          <>
            <div className={`options ${telasDaGravacao ? 'options-4' : 'options-3'} anexar-opcoes`}>
              {telasDaGravacao && (
                <button type="button" className="option" onClick={abrirTelas} disabled={!!ocupado || carregandoTelas}>
                  <span className="option-icone" aria-hidden="true"><Icone nome="tela" tamanho={20} /></span>
                  <strong>{carregandoTelas ? 'Carregando…' : 'Tela da gravação'}</strong>
                  <span className="option-texto">Selecione uma tela já marcada na gravação deste POP.</span>
                </button>
              )}
              <button type="button" className="option" onClick={() => obter(capturarTela)} disabled={!temCaptura || !!ocupado}>
                <span className="option-icone" aria-hidden="true"><Icone nome="camera" tamanho={20} /></span>
                <strong>{ocupado === 'capturando' ? 'Escolha a janela…' : 'Capturar uma janela'}</strong>
                <span className="option-texto">Selecione a janela aberta no sistema. O INCFlow captura a tela automaticamente.</span>
              </button>
              <button type="button" className="option" onClick={() => obter(lerPrintDaAreaDeTransferencia)} disabled={!!ocupado}>
                <span className="option-icone" aria-hidden="true"><Icone nome="copiar" tamanho={20} /></span>
                <strong>Colar print copiado</strong>
                <span className="option-texto">Tire um print (Print Screen ou Win + Shift + S) e cole aqui com Ctrl + V.</span>
              </button>
              <button type="button" className="option" onClick={() => arquivo.current?.click()} disabled={!!ocupado}>
                <span className="option-icone" aria-hidden="true"><Icone nome="pasta" tamanho={20} /></span>
                <strong>Escolher arquivo</strong>
                <span className="option-texto">Selecione uma imagem salva no computador (PNG, JPG ou WebP).</span>
              </button>
            </div>
            <input
              ref={arquivo}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              hidden
              aria-label="Arquivo do print"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (f) void obter(() => imagemParaPng(f));
              }}
            />
            {!temCaptura && <p className="notice">Este navegador não captura a tela. Use colar ou arquivo; no Chrome ou no Edge dá para capturar a janela direto.</p>}
            {erro && <p className="form-erro" role="alert">{erro}</p>}
            <div className="dialog-actions"><button className="btn" onClick={aoFechar} disabled={!!ocupado}>Cancelar</button></div>
          </>
        )}
      </div>
    </div>
  );
}
