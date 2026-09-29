'use client';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Icone } from '@/components/Icone';
import { DRAWIO_ORIGIN, DRAWIO_URL, configuracao, type MensagemDrawio } from '@/lib/drawio';
import { obter, salvar, type Fluxograma } from '@/lib/fluxogramas';

type Status = 'carregando' | 'salvo' | 'salvando' | 'erro';
type Exportacao = 'png' | 'svg' | 'miniatura';

const TEXTO_STATUS: Record<Status, string> = {
  carregando: 'Carregando editor…',
  salvo: 'Tudo salvo',
  salvando: 'Salvando…',
  erro: 'Erro ao salvar',
};

function baixar(nome: string, href: string) {
  const a = document.createElement('a');
  a.href = href;
  a.download = nome;
  a.click();
}

export function EditorDrawio({ id }: { id: string }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const container = useRef<HTMLDivElement>(null);
  const [fluxo, setFluxo] = useState<Fluxograma | null | undefined>(undefined);
  const [nome, setNome] = useState('');
  const [status, setStatus] = useState<Status>('carregando');
  const [menu, setMenu] = useState<'exportar' | 'layout' | null>(null);
  const xmlAtual = useRef('');
  const pendente = useRef<ReturnType<typeof setTimeout> | null>(null);
  const exportando = useRef<Exportacao | null>(null);
  const biblioteca = useRef<Promise<unknown[]>>(null);

  const salvo = useRef('');

  useEffect(() => {
    biblioteca.current = fetch('/drawio/biblioteca-inc.json').then((r) => r.json());
    obter(id)
      .then((f) => {
        setFluxo(f);
        setNome(f.nome);
        xmlAtual.current = f.xml;
        salvo.current = f.xml;
      })
      .catch(() => setFluxo(null));
  }, [id]);

  const enviar = useCallback((msg: object) => {
    frame.current?.contentWindow?.postMessage(JSON.stringify(msg), DRAWIO_ORIGIN);
  }, []);

  const gravar = useCallback(
    async (xml: string) => {
      if (xml === salvo.current) return setStatus('salvo');
      try {
        await salvar(id, { xml });
        salvo.current = xml;
        if (xmlAtual.current === xml) setStatus('salvo');
      } catch {
        setStatus('erro');
      }
    },
    [id],
  );

  const gerarMiniatura = useCallback(() => {
    exportando.current = 'miniatura';
    enviar({ action: 'export', format: 'svg', embedImages: false, border: 10 });
  }, [enviar]);

  useEffect(() => {
    if (!fluxo) return;
    async function onMessage(e: MessageEvent) {
      if (e.origin !== DRAWIO_ORIGIN || typeof e.data !== 'string') return;
      let msg: MensagemDrawio;
      try {
        msg = JSON.parse(e.data);
      } catch {
        return;
      }
      switch (msg.event) {
        case 'configure': {
          const lib = (await biblioteca.current) as Parameters<typeof configuracao>[0];
          enviar({ action: 'configure', config: configuracao(lib) });
          break;
        }
        case 'init':
          enviar({ action: 'load', xml: xmlAtual.current, autosave: 1, title: fluxo!.nome });
          break;
        case 'load':
          setStatus('salvo');
          enviar({ action: 'fit', border: 24, maxScale: 1 });
          break;
        case 'autosave':
          xmlAtual.current = msg.xml;
          setStatus('salvando');
          if (pendente.current) clearTimeout(pendente.current);
          pendente.current = setTimeout(() => gravar(msg.xml), 1200);
          break;
        case 'save':
          xmlAtual.current = msg.xml;
          if (pendente.current) clearTimeout(pendente.current);
          gravar(msg.xml);
          enviar({ action: 'status', message: 'Salvo', modified: false });
          gerarMiniatura();
          break;
        case 'export': {
          const tipo = exportando.current;
          exportando.current = null;
          const base = nome.trim() || 'fluxograma';
          if (tipo === 'miniatura') salvar(id, { miniatura: msg.data }).catch(() => {});
          else if (tipo === 'png') baixar(`${base}.png`, msg.data);
          else if (tipo === 'svg') baixar(`${base}.svg`, msg.data);
          break;
        }
      }
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [fluxo, enviar, gravar, gerarMiniatura, id, nome]);

  // Garante que nada se perde ao sair da página.
  useEffect(() => {
    const flush = () => {
      if (pendente.current) {
        clearTimeout(pendente.current);
        pendente.current = null;
        if (xmlAtual.current !== salvo.current) {
          // keepalive só aceita corpos pequenos (~64 KB); acima disso, envia normal.
          salvar(id, { xml: xmlAtual.current }, xmlAtual.current.length < 60_000).catch(() => {});
        }
      }
    };
    window.addEventListener('beforeunload', flush);
    return () => {
      window.removeEventListener('beforeunload', flush);
      flush();
    };
  }, [id]);

  function exportar(tipo: 'png' | 'svg' | 'drawio') {
    setMenu(null);
    const base = nome.trim() || 'fluxograma';
    if (tipo === 'drawio') {
      const blob = new Blob([xmlAtual.current], { type: 'application/xml' });
      const url = URL.createObjectURL(blob);
      baixar(`${base}.drawio`, url);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      return;
    }
    exportando.current = tipo;
    enviar(
      tipo === 'png'
        ? { action: 'export', format: 'png', scale: 2, border: 20, spinKey: 'exporting' }
        : { action: 'export', format: 'xmlsvg', border: 20, spinKey: 'exporting' },
    );
  }

  function reorganizar(layout: 'horizontalFlow' | 'verticalFlow') {
    setMenu(null);
    enviar({ action: 'layout', layouts: [{ layout }] });
  }

  function telaCheia() {
    if (document.fullscreenElement) document.exitFullscreen();
    else container.current?.requestFullscreen();
  }

  function renomear() {
    const n = nome.trim();
    if (!n || n === fluxo?.nome) return;
    salvar(id, { nome: n }).catch(() => setStatus('erro'));
    setFluxo((f) => (f ? { ...f, nome: n } : f));
  }

  if (fluxo === null) {
    return (
      <div className="page">
        <div className="empty">
          <h2>Fluxograma não encontrado</h2>
          <p>Ele pode ter sido excluído, ou houve um erro de conexão.</p>
          <Link href="/app/fluxogramas" className="btn btn-primary">Voltar para a lista</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="editor" ref={container}>
      <header className="editor-bar">
        <Link href="/app/fluxogramas" className="btn btn-icon" aria-label="Voltar para a lista" title="Voltar"><Icone nome="voltar" /></Link>
        <input
          className="title-input"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          onBlur={renomear}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          aria-label="Nome do fluxograma"
        />
        {fluxo && <span className="code hide-sm">{fluxo.codigo}</span>}
        <span className="status" role="status">
          <span className={`dot ${status === 'salvando' || status === 'carregando' ? 'saving' : status === 'erro' ? 'error' : ''}`} />
          {TEXTO_STATUS[status]}
        </span>

        <div className="bar-group" style={{ marginLeft: 'auto' }}>
          <button className="btn hide-sm" onClick={() => enviar({ action: 'fit', border: 24, maxScale: 1 })} title="Ajustar à tela">
            <Icone nome="ajustar" />Ajustar
          </button>
          <div className="menu hide-sm">
            <button className="btn" aria-expanded={menu === 'layout'} onClick={() => setMenu(menu === 'layout' ? null : 'layout')}>
              <Icone nome="layout" />Reorganizar
            </button>
            {menu === 'layout' && (
              <div className="menu-list" role="menu">
                <button role="menuitem" onClick={() => reorganizar('horizontalFlow')}>Fluxo horizontal</button>
                <button role="menuitem" onClick={() => reorganizar('verticalFlow')}>Fluxo vertical</button>
              </div>
            )}
          </div>
          <button className="btn btn-icon" onClick={telaCheia} aria-label="Tela cheia" title="Tela cheia"><Icone nome="expandir" /></button>
          <span className="bar-sep" />
          <div className="menu">
            <button className="btn btn-primary" aria-expanded={menu === 'exportar'} onClick={() => setMenu(menu === 'exportar' ? null : 'exportar')}>
              <Icone nome="baixar" />Exportar
            </button>
            {menu === 'exportar' && (
              <div className="menu-list" role="menu">
                <button role="menuitem" onClick={() => exportar('png')}>Imagem PNG</button>
                <button role="menuitem" onClick={() => exportar('svg')}>SVG editável</button>
                <button role="menuitem" onClick={() => exportar('drawio')}>Arquivo .drawio</button>
              </div>
            )}
          </div>
        </div>
      </header>
      <div className="frame-wrap">
        {fluxo && <iframe ref={frame} src={DRAWIO_URL} title="Editor de fluxograma" allow="clipboard-read; clipboard-write; fullscreen" />}
        {status === 'carregando' && <div className="loading">Carregando editor…</div>}
      </div>
    </div>
  );
}
