'use client';
import dynamic from 'next/dynamic';
import { useEffect, useRef, useState } from 'react';
import { Icone } from '@/components/Icone';
import { VisualizadorImagens, type ImagemAmpliavel } from '@/components/publico/VisualizadorImagens';
import { formatoDe, tamanhoLegivel, visualizacaoDe, type Abertura, type Arquivo } from '@/lib/anexos';
import { ErroCliente } from '@/lib/fluxogramas';

// Visualizador dos arquivos do POP (decisão 141), em tela cheia, sem sair da tela em que a pessoa está: PDF com
// páginas e zoom, imagem ampliada (passando pelas outras imagens da lista), vídeo e áudio com os controles do
// navegador e, para os outros formatos, o download. O endereço do arquivo é pedido ao servidor na hora de abrir:
// é ele quem recusa o arquivo expirado.

const LeitorPdf = dynamic(() => import('./LeitorPdf').then((m) => m.LeitorPdf), { ssr: false });

export type ItemDoVisualizador = Pick<Arquivo, 'id' | 'nome' | 'descricao' | 'tipo' | 'tamanho'>;
type Estado = { fase: 'abrindo' } | { fase: 'erro'; mensagem: string } | { fase: 'aberto'; abertura: Abertura } | { fase: 'imagens'; imagens: ImagemAmpliavel[]; inicial: number };

const mensagemDe = (e: unknown) => (e instanceof ErroCliente && e.status !== 500 ? e.message : 'Não foi possível abrir o arquivo. Tente de novo em instantes.');

export function VisualizadorDeArquivo({ arquivos, inicial, abrir, aoFechar }: {
  /** Os arquivos que podem ser abertos na lista de onde este saiu: as imagens passam de uma para a outra. */
  arquivos: ItemDoVisualizador[];
  inicial: string;
  abrir: (id: string) => Promise<Abertura>;
  aoFechar: () => void;
}) {
  const arquivo = arquivos.find((a) => a.id === inicial);
  const [estado, setEstado] = useState<Estado>({ fase: 'abrindo' });
  const [semMidia, setSemMidia] = useState(false); // o navegador não conseguiu tocar o vídeo ou o áudio
  const caixa = useRef<HTMLDivElement>(null);
  const fechar = useRef<HTMLButtonElement>(null);
  const abrirAtual = useRef(abrir);
  abrirAtual.current = abrir;

  useEffect(() => {
    if (!arquivo) return;
    let vivo = true;
    setEstado({ fase: 'abrindo' }); setSemMidia(false);
    (async () => {
      if (visualizacaoDe(arquivo) !== 'imagem') {
        const abertura = await abrirAtual.current(arquivo.id);
        if (vivo) setEstado({ fase: 'aberto', abertura });
        return;
      }
      // Imagem: abre junto as outras imagens da lista, para passar de uma para a outra. A que falhar fica de fora.
      const imagens = arquivos.filter((a) => visualizacaoDe(a) === 'imagem');
      const abertas = await Promise.allSettled(imagens.map((a) => abrirAtual.current(a.id)));
      if (!vivo) return;
      const meu = abertas[imagens.findIndex((a) => a.id === arquivo.id)];
      if (meu.status === 'rejected') throw meu.reason;
      const lista = imagens.flatMap((a, i) => {
        const r = abertas[i];
        return r.status === 'fulfilled' && r.value.url ? [{ id: a.id, src: r.value.url, alt: a.nome, legenda: a.descricao ? `${a.nome} · ${a.descricao}` : a.nome }] : [];
      });
      setEstado({ fase: 'imagens', imagens: lista, inicial: Math.max(0, lista.findIndex((x) => x.id === arquivo.id)) });
    })().catch((e) => { if (vivo) setEstado({ fase: 'erro', mensagem: mensagemDe(e) }); });
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [arquivo?.id]);

  const comImagens = estado.fase === 'imagens';
  // Trava a rolagem da página, devolve o foco a quem abriu e fecha com Esc (as imagens têm o visualizador delas).
  useEffect(() => {
    if (comImagens) return;
    const antes = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    fechar.current?.focus();
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); aoFechar(); return; }
      if (e.key !== 'Tab') return;
      const focaveis = [...(caixa.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), video, audio, [tabindex="0"]') ?? [])];
      if (!focaveis.length) return;
      const primeiro = focaveis[0], ultimo = focaveis[focaveis.length - 1];
      if (!caixa.current?.contains(document.activeElement)) { e.preventDefault(); primeiro.focus(); }
      else if (e.shiftKey && document.activeElement === primeiro) { e.preventDefault(); ultimo.focus(); }
      else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primeiro.focus(); }
    };
    window.addEventListener('keydown', tecla);
    return () => { window.removeEventListener('keydown', tecla); document.body.style.overflow = overflow; antes?.focus?.(); };
  }, [aoFechar, comImagens]);

  if (!arquivo) return null;
  if (estado.fase === 'imagens') return <VisualizadorImagens imagens={estado.imagens} inicial={estado.inicial} aoFechar={aoFechar} />;

  const abertura = estado.fase === 'aberto' ? estado.abertura : null;
  const tipo = abertura?.visualizacao ?? visualizacaoDe(arquivo);
  const baixar = abertura && <a className="btn btn-primary" href={abertura.download} download={arquivo.nome}><Icone nome="baixar" tamanho={16} />Baixar</a>;
  return (
    <div className="zoom arqv" ref={caixa} role="dialog" aria-modal="true" aria-label={`Arquivo: ${arquivo.nome}`}>
      <header className="zoom-barra">
        <div className="zoom-legenda">
          <strong>{arquivo.nome}</strong>
          {arquivo.descricao && <span>{arquivo.descricao}</span>}
        </div>
        <div className="zoom-ferramentas">
          {abertura && tipo !== 'outro' && <a className="zoom-btn zoom-texto" href={abertura.download} download={arquivo.nome} title="Baixar o arquivo"><Icone nome="baixar" />Baixar</a>}
          <span className="zoom-sep" />
          <button type="button" className="zoom-btn" ref={fechar} onClick={aoFechar} aria-label="Fechar" title="Fechar (Esc)"><Icone nome="fechar" /></button>
        </div>
      </header>
      <div className={`arqv-palco arqv-${tipo}`}>
        {estado.fase === 'abrindo' && <p className="leitor-aviso">Abrindo…</p>}
        {estado.fase === 'erro' && <p className="leitor-aviso" role="alert">{estado.mensagem}</p>}
        {abertura && tipo === 'pdf' && abertura.url && <LeitorPdf url={abertura.url} nome={arquivo.nome} />}
        {abertura && tipo === 'video' && abertura.url && !semMidia && (
          // eslint-disable-next-line jsx-a11y/media-has-caption
          <video src={abertura.url} controls autoPlay playsInline onError={() => setSemMidia(true)} />
        )}
        {abertura && tipo === 'audio' && abertura.url && !semMidia && (
          // eslint-disable-next-line jsx-a11y/media-has-caption
          <audio src={abertura.url} controls autoPlay onError={() => setSemMidia(true)} />
        )}
        {abertura && (tipo === 'outro' || semMidia || !abertura.url) && (
          <div className="arqv-download">
            <span className="arqv-download-icone"><Icone nome="documento" tamanho={30} /></span>
            <strong>{arquivo.nome}</strong>
            <span>{formatoDe(arquivo)} · {tamanhoLegivel(arquivo.tamanho)}</span>
            <p>{semMidia ? 'O navegador não conseguiu reproduzir este arquivo.' : 'Este formato não tem visualização no navegador.'}</p>
            {baixar}
          </div>
        )}
      </div>
    </div>
  );
}
