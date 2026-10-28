'use client';
import { useEffect, useRef, useState } from 'react';
import { Icone } from '@/components/Icone';
import { capturarTela, imagemColada, imagemParaPng, lerPrintDaAreaDeTransferencia, suportaCapturaDeTela, type Print } from '@/lib/gravacao/captura';

// Print para um passo do POP, fora da gravação: para a tela que faltou (esquecida na gravação
// ou que mudou depois). Três caminhos: capturar uma janela agora, colar ou escolher arquivo.
export function AnexarPrint({ titulo, aoAnexar, aoFechar }: { titulo: string; aoAnexar: (p: Print) => Promise<void>; aoFechar: () => void }) {
  const [previa, setPrevia] = useState<(Print & { url: string }) | null>(null);
  const [erro, setErro] = useState('');
  const [ocupado, setOcupado] = useState<'' | 'capturando' | 'anexando'>('');
  const [temCaptura, setTemCaptura] = useState(false);
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
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="anexar-print" onClick={() => !ocupado && aoFechar()}>
      <div
        className="dialog dialog-lg anexar"
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
        <h2 id="anexar-print">Anexar print · {titulo}</h2>
        {previa ? (
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
            <div className="options options-3 anexar-opcoes">
              <button type="button" className="option" onClick={() => obter(capturarTela)} disabled={!temCaptura || !!ocupado}>
                <strong><Icone nome="camera" tamanho={14} /> {ocupado === 'capturando' ? 'Escolha a janela…' : 'Capturar uma janela agora'}</strong>
                <span>Deixe a tela que faltou aberta no sistema, escolha a janela e o Fluxi tira o print.</span>
              </button>
              <button type="button" className="option" onClick={() => obter(lerPrintDaAreaDeTransferencia)} disabled={!!ocupado}>
                <strong><Icone nome="copiar" tamanho={14} /> Colar print copiado</strong>
                <span>Tire o print (Print Screen ou Win+Shift+S) e cole. Ctrl+V nesta janela também funciona.</span>
              </button>
              <button type="button" className="option" onClick={() => arquivo.current?.click()} disabled={!!ocupado}>
                <strong><Icone nome="pasta" tamanho={14} /> Escolher arquivo</strong>
                <span>PNG, JPG ou WebP salvo no computador.</span>
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
