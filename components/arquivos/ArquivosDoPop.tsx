'use client';
import { Icone } from '@/components/Icone';
import { dataBr, etapasDoArquivo, formatoDe, nomeDaEtapa, tamanhoLegivel, textoDaValidade, type Arquivo } from '@/lib/anexos';
import { IconeDoArquivo, SeloSituacao } from './Pecas';

// A aba Arquivos do POP (decisão 141): todos os arquivos anexados, com a descrição, as etapas em que são usados,
// a validade e a situação. O arquivo expirado continua na lista, mas não abre.

export function ArquivosDoPop({ arquivos, procedimentos, bloqueado, aoAnexar, aoVer, aoEditar, aoExcluir }: {
  arquivos: Arquivo[];
  procedimentos: { nome: string; arquivos?: string[] }[];
  /** POP arquivado: só consulta. */
  bloqueado: boolean;
  aoAnexar: () => void;
  aoVer: (a: Arquivo) => void;
  aoEditar: (a: Arquivo) => void;
  aoExcluir: (a: Arquivo) => void;
}) {
  return (
    <section className="cartao pop-sec" id="pos-arquivos" aria-labelledby="titulo-arquivos">
      <div className="sec-titulo">
        <div className="sec-cabeca">
          <h2 className="titulo-com-conta" id="titulo-arquivos">Arquivos{arquivos.length > 0 && <small>{arquivos.length}</small>}</h2>
          <p>Documentos, imagens e vídeos usados na execução do POP.</p>
        </div>
        {!bloqueado && <button type="button" className="btn" onClick={aoAnexar}><Icone nome="clipe" tamanho={16} />Anexar arquivo</button>}
      </div>
      {arquivos.length === 0 ? (
        <p className="recursos-vazio">Nenhum arquivo ainda.</p>
      ) : (
        <ul className="arq-lista">
          <li className="arq-linha arq-cab" aria-hidden="true"><span /><span>Arquivo</span><span>Etapas</span><span>Validade</span><span>Situação</span><span /></li>
          {arquivos.map((a) => {
            const etapas = etapasDoArquivo(procedimentos, a.id);
            const expirado = a.situacao === 'expirado';
            return (
              <li key={a.id} className={`arq-linha${expirado ? ' expirado' : ''}`}>
                <IconeDoArquivo arquivo={a} />
                <div className="arq-principal">
                  <strong>{a.nome}</strong>
                  {a.descricao && <span className="arq-descricao">{a.descricao}</span>}
                  <small>{formatoDe(a)} · {tamanhoLegivel(a.tamanho)} · incluído em {dataBr(a.criado_em)}{a.criado_por ? ` por ${a.criado_por}` : ''}</small>
                </div>
                <div className="arq-etapas-chips" aria-label="Etapas">
                  {etapas.length === 0 ? <span className="arq-chip geral">Geral do POP</span> : etapas.map((i) => <span key={i} className="arq-chip" title={nomeDaEtapa(i + 1, procedimentos[i].nome)}>Etapa {i + 1}</span>)}
                </div>
                <span className="arq-validade-texto">{textoDaValidade(a)}</span>
                <SeloSituacao situacao={a.situacao} />
                <div className="arq-acoes">
                  <button type="button" className="btn btn-icon" onClick={() => aoVer(a)} disabled={expirado} aria-label={`Visualizar ${a.nome}`} title={expirado ? 'Arquivo expirado: não pode ser aberto' : 'Visualizar'}><Icone nome="olho" tamanho={16} /></button>
                  {!bloqueado && <button type="button" className="btn btn-icon" onClick={() => aoEditar(a)} aria-label={`Editar ${a.nome}`} title="Editar descrição, etapas e validade"><Icone nome="editar" tamanho={16} /></button>}
                  {!bloqueado && <button type="button" className="btn btn-icon btn-lixo" onClick={() => aoExcluir(a)} aria-label={`Excluir ${a.nome}`} title="Excluir"><Icone nome="lixo" tamanho={16} /></button>}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
