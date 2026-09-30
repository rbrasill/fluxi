'use client';
import { useState } from 'react';
import { Icone } from '@/components/Icone';
import { ErroCliente, criar, gerarComIa, transcreverAudio } from '@/lib/fluxogramas';

type Modo = 'manual' | 'exemplo' | 'ia';
type Fonte = 'descricao' | 'transcricao' | 'audio';

const EXTENSOES_TEXTO = ['.txt', '.vtt', '.srt', '.md'];

export function NovoFluxograma({ creditos, processoId, aoFechar, aoCriar }: {
  creditos: number | null;
  processoId?: string;
  aoFechar: () => void;
  aoCriar: (id: string, creditos?: number) => void;
}) {
  const [nome, setNome] = useState('');
  const [modo, setModo] = useState<Modo>('manual');
  const [fonte, setFonte] = useState<Fonte>('descricao');
  const [texto, setTexto] = useState('');
  const [audio, setAudio] = useState<File | null>(null);
  const [etapa, setEtapa] = useState('');
  const [erro, setErro] = useState('');
  const semCreditos = creditos === 0;
  const ocupado = etapa !== '';

  async function lerArquivoTexto(f: File) {
    setTexto(await f.text());
  }

  async function confirmar(e: React.FormEvent) {
    e.preventDefault();
    setErro('');
    try {
      if (modo === 'manual') {
        setEtapa('Criando…');
        const f = await criar(nome.trim() || 'Novo fluxograma', '', 'manual', processoId);
        return aoCriar(f.id);
      }
      if (modo === 'exemplo') {
        setEtapa('Criando…');
        const xml = await (await fetch('/drawio/exemplo-emcash.drawio')).text();
        const f = await criar(nome.trim() || 'Exemplo EmCash', xml, 'modelo', processoId);
        return aoCriar(f.id);
      }
      let conteudo = texto;
      if (fonte === 'audio') {
        if (!audio) throw new Error('Escolha um arquivo de áudio ou vídeo.');
        conteudo = await transcreverAudio(audio, setEtapa);
      }
      setEtapa('A IA está montando o fluxograma… (pode levar até 1 minuto)');
      const f = await gerarComIa(conteudo, fonte === 'descricao' ? 'descricao' : 'transcricao', nome.trim() || undefined, processoId);
      aoCriar(f.id, f.creditos);
    } catch (e) {
      setEtapa('');
      if (e instanceof ErroCliente && e.codigo === 'sem_creditos') {
        setErro(e.message);
        setModo('manual');
      } else setErro(e instanceof Error ? e.message : 'Algo deu errado.');
    }
  }

  const podeEnviar = modo !== 'ia' || (fonte === 'audio' ? !!audio : texto.trim().length >= 30);

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="novo-titulo" onClick={() => !ocupado && aoFechar()}>
      <form className="dialog dialog-lg" onClick={(e) => e.stopPropagation()} onSubmit={confirmar}>
        <h2 id="novo-titulo">Novo fluxograma</h2>
        <label className="field">
          Nome {modo === 'ia' && <span className="opcional">· opcional, a IA sugere</span>}
          <input autoFocus value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Aprovação de proposta comercial" disabled={ocupado} />
        </label>

        <div className="options options-3">
          <button type="button" className="option" aria-pressed={modo === 'manual'} onClick={() => setModo('manual')} disabled={ocupado}>
            <strong>Manual</strong><span>Desenhe do zero com a biblioteca BPMN INC.</span>
          </button>
          <button type="button" className="option" aria-pressed={modo === 'ia'} onClick={() => setModo('ia')} disabled={ocupado || semCreditos}>
            <strong><Icone nome="ia" tamanho={14} /> Gerar com IA</strong>
            <span>{semCreditos ? 'Sem créditos. Use o modo manual.' : `A partir de texto, transcrição ou áudio. ${creditos ?? '–'} crédito(s).`}</span>
          </button>
          <button type="button" className="option" aria-pressed={modo === 'exemplo'} onClick={() => setModo('exemplo')} disabled={ocupado}>
            <strong>Exemplo EmCash</strong><span>O fluxograma de referência.</span>
          </button>
        </div>

        {modo === 'ia' && (
          <div className="ia-box">
            <div className="segmented" role="tablist">
              {(['descricao', 'transcricao', 'audio'] as Fonte[]).map((f) => (
                <button key={f} type="button" role="tab" aria-selected={fonte === f} onClick={() => setFonte(f)} disabled={ocupado}>
                  {f === 'descricao' ? 'Descrever o processo' : f === 'transcricao' ? 'Transcrição' : 'Áudio / vídeo'}
                </button>
              ))}
            </div>
            {fonte !== 'audio' ? (
              <>
                <textarea
                  className="texto-ia"
                  rows={8}
                  value={texto}
                  onChange={(e) => setTexto(e.target.value)}
                  disabled={ocupado}
                  placeholder={
                    fonte === 'descricao'
                      ? 'Ex.: O corretor cadastra a proposta. O Comercial analisa e envia ao Financeiro, que verifica o crédito. Se aprovado, o Jurídico prepara o contrato; se não, o Comercial renegocia…'
                      : 'Cole aqui a transcrição da reunião (Teams, Meet, Zoom…).'
                  }
                />
                {fonte === 'transcricao' && (
                  <label className="arquivo">
                    <input type="file" accept={EXTENSOES_TEXTO.join(',')} onChange={(e) => e.target.files?.[0] && lerArquivoTexto(e.target.files[0])} disabled={ocupado} />
                    ou carregar arquivo ({EXTENSOES_TEXTO.join(', ')})
                  </label>
                )}
              </>
            ) : (
              <label className="drop">
                <input type="file" accept="audio/*,video/*" onChange={(e) => setAudio(e.target.files?.[0] || null)} disabled={ocupado} />
                <Icone nome="gravacao" tamanho={28} />
                <strong>{audio ? audio.name : 'Escolha a gravação da reunião'}</strong>
                <span>MP3, M4A, WAV, MP4… A transcrição usa 1 crédito e a geração do fluxograma, mais 1.</span>
              </label>
            )}
          </div>
        )}

        {erro && <p className="form-erro" role="alert">{erro}</p>}
        {etapa && <p className="form-etapa" role="status"><span className="spinner" />{etapa}</p>}

        <div className="dialog-actions">
          <button type="button" className="btn" onClick={aoFechar} disabled={ocupado}>Cancelar</button>
          <button type="submit" className="btn btn-primary" disabled={ocupado || !podeEnviar}>
            {modo === 'ia' ? 'Gerar fluxograma' : 'Criar e abrir'}
          </button>
        </div>
      </form>
    </div>
  );
}
