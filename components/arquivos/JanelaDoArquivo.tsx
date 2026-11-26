'use client';
import { useEffect, useRef, useState } from 'react';
import { Icone } from '@/components/Icone';
import { AVISAR_PADRAO, MAX_AVISAR, MAX_DESCRICAO, MIN_DESCRICAO, TAMANHO_MAXIMO, anexarArquivo, editarArquivo, formatoDe, hojeEmBrasilia, nomeDaEtapa, tamanhoLegivel, type Arquivo } from '@/lib/anexos';
import { IconeDoArquivo } from './Pecas';

// Janela de anexar um arquivo ao POP ou de editar o cadastro dele (decisão 141): o arquivo, a descrição, as etapas
// em que ele é usado (nenhuma: referência geral do POP) e a validade, com o aviso de vencimento. O arquivo em si não
// se troca: cada atualização é um arquivo novo.

export function JanelaDoArquivo({ popId, etapas, arquivo, etapasIniciais, aoSalvar, aoFechar }: {
  popId: string;
  /** As etapas do POP, na ordem. */
  etapas: { nome: string }[];
  /** Editando este arquivo; sem ele, a janela anexa um novo. */
  arquivo?: Arquivo;
  /** As etapas (posições, a partir de 0) já marcadas. */
  etapasIniciais: number[];
  aoSalvar: (arquivo: Arquivo, etapas: number[]) => void;
  aoFechar: () => void;
}) {
  const [escolhido, setEscolhido] = useState<File | null>(null);
  const [descricao, setDescricao] = useState(arquivo?.descricao ?? '');
  const [marcadas, setMarcadas] = useState<number[]>(etapasIniciais);
  const [comValidade, setComValidade] = useState(!!arquivo?.validade);
  const [validade, setValidade] = useState(arquivo?.validade ?? '');
  const [avisar, setAvisar] = useState(String(arquivo?.avisar_dias ?? AVISAR_PADRAO));
  const [enviando, setEnviando] = useState(false);
  const [progresso, setProgresso] = useState(0);
  const [erro, setErro] = useState('');
  const [arrastando, setArrastando] = useState(false);
  const seletor = useRef<HTMLInputElement>(null);
  const campoDescricao = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape' && !enviando) aoFechar(); };
    document.addEventListener('keydown', tecla);
    return () => document.removeEventListener('keydown', tecla);
  }, [aoFechar, enviando]);

  function escolher(f: File | null | undefined) {
    if (!f) return;
    setErro('');
    setEscolhido(f);
    campoDescricao.current?.focus();
  }

  const limpa = descricao.replace(/\s+/g, ' ').trim();
  const dias = Number(avisar);
  const grande = !!escolhido && escolhido.size > TAMANHO_MAXIMO;
  const falta = !arquivo && !escolhido ? 'Escolha o arquivo.'
    : grande ? `O arquivo tem ${tamanhoLegivel(escolhido!.size)}. O limite é ${tamanhoLegivel(TAMANHO_MAXIMO)}.`
    : escolhido && escolhido.size === 0 ? 'O arquivo está vazio.'
    : limpa.length < MIN_DESCRICAO ? 'Descreva o arquivo: o que ele é e para que serve.'
    : comValidade && !validade ? 'Informe a data de validade.'
    : comValidade && (!Number.isInteger(dias) || dias < 0 || dias > MAX_AVISAR) ? `O aviso vai de 0 a ${MAX_AVISAR} dias.`
    : '';

  async function salvar() {
    if (falta || enviando) return;
    setEnviando(true); setErro(''); setProgresso(0);
    const dados = { descricao: limpa, validade: comValidade ? validade : null, avisar_dias: comValidade ? dias : arquivo?.avisar_dias ?? AVISAR_PADRAO };
    try {
      const salvo = arquivo ? await editarArquivo(popId, arquivo.id, dados) : await anexarArquivo(popId, escolhido!, dados, setProgresso);
      aoSalvar(salvo, [...marcadas].sort((a, b) => a - b));
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível salvar o arquivo. Tente de novo em instantes.');
      setEnviando(false);
    }
  }

  const mostrado = arquivo ?? (escolhido ? { nome: escolhido.name, tipo: escolhido.type, tamanho: escolhido.size } : null);
  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="arq-titulo" onClick={() => !enviando && aoFechar()}>
      <form className="dialog dialog-lg arq-janela" onClick={(e) => e.stopPropagation()} onSubmit={(e) => { e.preventDefault(); void salvar(); }}>
        <div className="dialogo-topo">
          <div className="dialogo-topo-texto"><h2 id="arq-titulo">{arquivo ? 'Editar arquivo' : 'Anexar arquivo'}</h2></div>
          <button type="button" className="btn btn-ghost btn-icon dialog-fechar" onClick={aoFechar} disabled={enviando} title="Fechar" aria-label="Fechar"><Icone nome="fechar" tamanho={18} /></button>
        </div>

        {mostrado ? (
          <div className="arq-escolhido">
            <IconeDoArquivo arquivo={mostrado} tamanho={20} />
            <span className="arq-escolhido-texto"><strong>{mostrado.nome}</strong><small>{formatoDe(mostrado)} · {tamanhoLegivel(mostrado.tamanho)}</small></span>
            {!arquivo && <button type="button" className="btn btn-ghost" onClick={() => seletor.current?.click()} disabled={enviando}>Trocar</button>}
          </div>
        ) : (
          <button type="button" className={`arq-soltar${arrastando ? ' sobre' : ''}`} onClick={() => seletor.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setArrastando(true); }} onDragLeave={() => setArrastando(false)}
            onDrop={(e) => { e.preventDefault(); setArrastando(false); escolher(e.dataTransfer.files?.[0]); }}>
            <Icone nome="clipe" tamanho={22} />
            <strong>Escolher arquivo</strong>
            <span>ou arraste para cá · até {tamanhoLegivel(TAMANHO_MAXIMO)}</span>
          </button>
        )}
        <input ref={seletor} type="file" hidden aria-label="Arquivo" onChange={(e) => { escolher(e.target.files?.[0]); e.target.value = ''; }} />

        <label className="field">Descrição
          <input ref={campoDescricao} value={descricao} maxLength={MAX_DESCRICAO} onChange={(e) => setDescricao(e.target.value)} disabled={enviando}
            placeholder="Ex.: Formulário de solicitação de compra, preenchido no passo 3" autoFocus={!!arquivo} />
        </label>

        {etapas.length > 0 && (
          <fieldset className="arq-campo">
            <legend>Etapas relacionadas <small>opcional</small></legend>
            <div className="arq-etapas">
              {etapas.map((e, i) => (
                <label key={i} className="arq-etapa-opcao">
                  <input type="checkbox" checked={marcadas.includes(i)} disabled={enviando} onChange={(ev) => setMarcadas((m) => (ev.target.checked ? [...m, i] : m.filter((x) => x !== i)))} />
                  <span>{nomeDaEtapa(i + 1, e.nome)}</span>
                </label>
              ))}
            </div>
          </fieldset>
        )}

        <fieldset className="arq-campo">
          <legend>Validade</legend>
          <div className="arq-validade" role="radiogroup" aria-label="Validade">
            <label className="arq-radio"><input type="radio" name="arq-validade" checked={!comValidade} disabled={enviando} onChange={() => setComValidade(false)} /><span>Sem validade definida</span></label>
            <label className="arq-radio"><input type="radio" name="arq-validade" checked={comValidade} disabled={enviando} onChange={() => setComValidade(true)} /><span>Válido até</span></label>
            {comValidade && (
              <>
                <input type="date" className="arq-data" value={validade} min={arquivo ? undefined : hojeEmBrasilia()} disabled={enviando} onChange={(e) => setValidade(e.target.value)} aria-label="Data de validade" />
                <label className="arq-avisar">Avisar
                  <input type="number" min={0} max={MAX_AVISAR} step={1} value={avisar} disabled={enviando} onChange={(e) => setAvisar(e.target.value)} aria-label="Dias de antecedência do aviso de vencimento" />
                  dias antes
                </label>
              </>
            )}
          </div>
        </fieldset>

        {enviando && !arquivo && (
          <div className="arq-progresso" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progresso * 100)} aria-label="Envio do arquivo">
            <span style={{ width: `${Math.round(progresso * 100)}%` }} />
          </div>
        )}
        {erro && <p className="notice erro" role="alert">{erro}</p>}

        <div className="versao-rodape">
          <p className="versao-resumo" role="status">{enviando ? (arquivo ? 'Salvando…' : `Enviando… ${Math.round(progresso * 100)}%`) : falta}</p>
          <div className="dialog-actions">
            <button type="button" className="btn" onClick={aoFechar} disabled={enviando}>Cancelar</button>
            <button type="submit" className="btn btn-primary" disabled={!!falta || enviando}><Icone nome={arquivo ? 'check' : 'clipe'} tamanho={16} />{arquivo ? 'Salvar' : 'Anexar'}</button>
          </div>
        </div>
      </form>
    </div>
  );
}
