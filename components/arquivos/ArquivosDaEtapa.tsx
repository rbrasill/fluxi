'use client';
import { useEffect, useRef, useState } from 'react';
import { Icone } from '@/components/Icone';
import type { Arquivo } from '@/lib/anexos';
import { IconeDoArquivo } from './Pecas';

// Os arquivos de uma etapa, dentro do editor do POP (decisão 141): os que já estão ligados a ela e o botão para
// ligar um arquivo já anexado ao POP ou anexar um novo. O arquivo expirado continua aparecendo, marcado, mas não abre.

export function ArquivosDaEtapa({ etapa, arquivos, ids, aoVer, aoMudar, aoAnexarNovo }: {
  /** "Etapa 2", para os rótulos. */
  etapa: string;
  /** Todos os arquivos do POP. */
  arquivos: Arquivo[];
  /** Os ids ligados a esta etapa. */
  ids: string[];
  aoVer: (a: Arquivo) => void;
  aoMudar: (ids: string[]) => void;
  aoAnexarNovo: () => void;
}) {
  const [aberto, setAberto] = useState(false);
  const menu = useRef<HTMLDivElement>(null);
  const ligados = ids.flatMap((id) => arquivos.filter((a) => a.id === id));
  // O arquivo expirado não pode ser ligado a uma etapa.
  const livres = arquivos.filter((a) => !ids.includes(a.id) && a.situacao !== 'expirado');

  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => { if (!menu.current?.contains(e.target as Node)) setAberto(false); };
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') setAberto(false); };
    document.addEventListener('mousedown', fora);
    document.addEventListener('keydown', tecla);
    return () => { document.removeEventListener('mousedown', fora); document.removeEventListener('keydown', tecla); };
  }, [aberto]);

  return (
    <div className="etapa-arquivos">
      <span className="etapa-arquivos-rotulo"><Icone nome="clipe" tamanho={15} />Arquivos</span>
      {ligados.map((a) => {
        const expirado = a.situacao === 'expirado';
        return (
          <span key={a.id} className={`arq-ficha${expirado ? ' expirado' : a.situacao === 'vencendo' ? ' vencendo' : ''}`}>
            <button type="button" className="arq-ficha-abrir" onClick={() => aoVer(a)} disabled={expirado} title={expirado ? 'Arquivo expirado: não pode ser aberto' : a.descricao || a.nome}>
              <IconeDoArquivo arquivo={a} tamanho={14} /><span>{a.nome}</span>{expirado && <em>Expirado</em>}
            </button>
            <button type="button" className="arq-ficha-tirar" onClick={() => aoMudar(ids.filter((x) => x !== a.id))} aria-label={`Tirar ${a.nome} da ${etapa}`} title="Tirar desta etapa (o arquivo continua no POP)"><Icone nome="fechar" tamanho={13} /></button>
          </span>
        );
      })}
      <div className="etapa-arquivos-menu" ref={menu}>
        <button type="button" className="link-acao" aria-haspopup="menu" aria-expanded={aberto} onClick={() => (arquivos.length ? setAberto((x) => !x) : aoAnexarNovo())}>
          <Icone nome="mais" tamanho={15} />Adicionar arquivo
        </button>
        {aberto && (
          <div className="arq-menu" role="menu" aria-label={`Arquivos para a ${etapa}`}>
            {livres.map((a) => (
              <button key={a.id} type="button" role="menuitem" onClick={() => { aoMudar([...ids, a.id]); setAberto(false); }}>
                <IconeDoArquivo arquivo={a} tamanho={14} /><span><strong>{a.nome}</strong>{a.descricao && <small>{a.descricao}</small>}</span>
              </button>
            ))}
            {livres.length === 0 && <p>Todos os arquivos do POP já estão nesta etapa.</p>}
            <button type="button" role="menuitem" className="arq-menu-novo" onClick={() => { setAberto(false); aoAnexarNovo(); }}><Icone nome="clipe" tamanho={15} />Anexar novo arquivo</button>
          </div>
        )}
      </div>
    </div>
  );
}
