'use client';
import { useEffect, useState } from 'react';
import { Icone } from '@/components/Icone';
import { MAX_CONVERSAS_FLUXO } from '@/lib/entrevista/topicos';
import { listarEntrevistasDoProcesso, quandoFoiAEntrevista, type EntrevistaDoProcesso } from '@/lib/entrevistas';
import { criar, gerarComIa, transcreverAudio } from '@/lib/fluxogramas';

// Cria o fluxograma do processo (um por processo, decisão 31): desenhado à mão ou gerado com IA a
// partir de uma descrição, da transcrição ou do áudio de uma reunião, ou das conversas com a Maia sobre
// o processo (decisão 63). Gravação de tela não vira fluxograma (decisão 33): ela serve só ao POP. Com
// `substituir`, o processo já tem fluxograma e a IA gera outro no lugar dele (o desenho atual é perdido;
// o aviso fica no diálogo).

type Modo = 'manual' | 'ia';
type Fonte = 'descricao' | 'transcricao' | 'audio' | 'maia';
const FONTES: { id: Fonte; rotulo: string }[] = [
  { id: 'descricao', rotulo: 'Descrever o processo' },
  { id: 'transcricao', rotulo: 'Transcrição' },
  { id: 'audio', rotulo: 'Áudio / vídeo' },
  { id: 'maia', rotulo: 'Conversa com a Maia' },
];
const duracao = (s: number) => (s >= 60 ? `${Math.round(s / 60)} min` : `${Math.round(s)} s`);

const EXTENSOES_TEXTO = ['.txt', '.vtt', '.srt', '.md'];

export function NovoFluxograma({ processoId, substituir = false, modoInicial = 'manual', nomeSugerido = '', aoFechar, aoCriar }: {
  processoId: string;
  substituir?: boolean;
  modoInicial?: Modo;
  nomeSugerido?: string;
  aoFechar: () => void;
  aoCriar: (id: string) => void;
}) {
  const [nome, setNome] = useState(nomeSugerido);
  const [modo, setModo] = useState<Modo>(substituir ? 'ia' : modoInicial);
  const [fonte, setFonte] = useState<Fonte>('descricao');
  const [texto, setTexto] = useState('');
  const [audio, setAudio] = useState<File | null>(null);
  // As conversas com a Maia deste processo que já têm resultado (null enquanto carrega) e as escolhidas.
  const [conversas, setConversas] = useState<EntrevistaDoProcesso[] | null>(null);
  const [marcadas, setMarcadas] = useState<string[]>([]);
  const [etapa, setEtapa] = useState('');
  const [erro, setErro] = useState('');
  const ocupado = etapa !== '';

  // As conversas já vêm todas marcadas (até o limite): o fluxograma do processo junta o que cada pessoa contou.
  useEffect(() => {
    listarEntrevistasDoProcesso(processoId)
      .then((l) => { const prontas = l.filter((x) => x.tem_resultado); setConversas(prontas); setMarcadas(prontas.slice(0, MAX_CONVERSAS_FLUXO).map((x) => x.id)); })
      .catch(() => setConversas([]));
  }, [processoId]);
  const alternar = (id: string) => setMarcadas((m) => (m.includes(id) ? m.filter((x) => x !== id) : m.length < MAX_CONVERSAS_FLUXO ? [...m, id] : m));

  async function lerArquivoTexto(f: File) {
    setTexto(await f.text());
  }

  async function confirmar(e: React.FormEvent) {
    e.preventDefault();
    setErro('');
    try {
      if (modo === 'manual') {
        setEtapa('Criando…');
        const f = await criar(nome.trim() || 'Fluxograma do processo', '', 'manual', processoId);
        return aoCriar(f.id);
      }
      if (fonte === 'maia') {
        setEtapa(`A IA está lendo ${marcadas.length === 1 ? 'a conversa' : `as ${marcadas.length} conversas`} e montando o fluxograma… (pode levar até 1 minuto)`);
        const f = await gerarComIa({ entrevistas: marcadas, origem: 'entrevista', nome: nome.trim() || undefined, processo_id: processoId, substituir });
        return aoCriar(f.id);
      }
      let conteudo = texto;
      if (fonte === 'audio') {
        if (!audio) throw new Error('Escolha um arquivo de áudio ou vídeo.');
        conteudo = await transcreverAudio(audio, setEtapa);
      }
      setEtapa('A IA está montando o fluxograma… (pode levar até 1 minuto)');
      const f = await gerarComIa({ texto: conteudo, origem: fonte === 'descricao' ? 'descricao' : 'transcricao', nome: nome.trim() || undefined, processo_id: processoId, substituir });
      aoCriar(f.id);
    } catch (e) {
      setEtapa('');
      setErro(e instanceof Error ? e.message : 'Algo deu errado.');
    }
  }

  const podeEnviar = modo !== 'ia' || (fonte === 'maia' ? marcadas.length > 0 : fonte === 'audio' ? !!audio : texto.trim().length >= 30);

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="novo-titulo" onClick={() => !ocupado && aoFechar()}>
      <form className="dialog dialog-lg" onClick={(e) => e.stopPropagation()} onSubmit={confirmar}>
        <h2 id="novo-titulo">{substituir ? 'Gerar o fluxograma de novo com IA' : 'Fluxograma do processo'}</h2>
        {substituir && <p className="aviso">O desenho atual será substituído pelo que a IA gerar. Se quiser só ajustar, abra o fluxograma e edite.</p>}
        <label className="field">
          Nome {modo === 'ia' && <span className="opcional">· opcional, a IA sugere</span>}
          <input autoFocus value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome do fluxograma" disabled={ocupado} />
        </label>

        {!substituir && (
          <div className="options">
            <button type="button" className="option" aria-pressed={modo === 'manual'} onClick={() => setModo('manual')} disabled={ocupado}>
              <strong>Desenhar</strong><span>Do zero, com a Biblioteca de Processos.</span>
            </button>
            <button type="button" className="option" aria-pressed={modo === 'ia'} onClick={() => setModo('ia')} disabled={ocupado}>
              <strong><Icone nome="ia" tamanho={14} /> Gerar com IA</strong>
              <span>A partir de uma descrição, de uma reunião (transcrição ou áudio) ou das conversas com a Maia.</span>
            </button>
          </div>
        )}

        {modo === 'ia' && (
          <div className="ia-box">
            <div className="segmented fontes-ia" role="tablist">
              {FONTES.map((f) => (
                <button key={f.id} type="button" role="tab" aria-selected={fonte === f.id} onClick={() => setFonte(f.id)} disabled={ocupado}>
                  {f.id === 'maia' && <Icone nome="microfone" tamanho={14} />}{f.rotulo}
                </button>
              ))}
            </div>
            {fonte === 'maia' ? (
              <>
                {conversas === null && <p className="notice">Carregando as conversas…</p>}
                {conversas?.length === 0 && <p className="notice">Este processo ainda não tem conversa concluída com a Maia. Convide quem executa o processo na seção “Entrevistas com a Maia”; quando a conversa terminar, ela aparece aqui.</p>}
                {conversas && conversas.length > 0 && (
                  <>
                    <p className="notice">A IA lê o que cada pessoa contou à Maia (a conversa inteira e o resumo) e desenha o fluxograma. {conversas.length > 1 ? `Com mais de uma conversa marcada, junta tudo num desenho só (até ${MAX_CONVERSAS_FLUXO}).` : ''}</p>
                    <div className="lista-pessoas conversas-fluxo" role="group" aria-label="Conversas com a Maia deste processo">
                      {conversas.map((c) => {
                        const marcada = marcadas.includes(c.id);
                        return (
                          <label key={c.id} className={`pessoa-opcao${marcada ? ' marcada' : ''}`}>
                            <input type="checkbox" checked={marcada} disabled={ocupado || (!marcada && marcadas.length >= MAX_CONVERSAS_FLUXO)} onChange={() => alternar(c.id)} />
                            <span className="pessoa-opcao-nome">{c.entrevistado ?? 'Pessoa entrevistada'}<small>{quandoFoiAEntrevista(c)}{c.duracao_s ? ` · ${duracao(c.duracao_s)}` : ''}{c.falas ? ` · ${c.falas} falas` : ''}</small></span>
                            {c.pendencias > 0 && <span className="pessoa-opcao-aviso">{c.pendencias} em aberto</span>}
                          </label>
                        );
                      })}
                    </div>
                  </>
                )}
              </>
            ) : fonte !== 'audio' ? (
              <>
                <textarea
                  className="texto-ia"
                  rows={8}
                  value={texto}
                  onChange={(e) => setTexto(e.target.value)}
                  disabled={ocupado}
                  placeholder={
                    fonte === 'descricao'
                      ? 'Descreva o processo em ordem: quem inicia, o que cada área faz, as decisões (se aprovado…, se não…) e como termina.'
                      : 'Cole aqui a transcrição de uma reunião sobre o processo (Teams, Meet, Zoom…).'
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
                <span>{audio ? `${(audio.size / 1024 / 1024).toFixed(1)} MB · ` : ''}MP3, M4A, WAV, MP4… até 50 MB</span>
              </label>
            )}
          </div>
        )}

        {erro && <p className="form-erro" role="alert">{erro}</p>}
        {etapa && <p className="form-etapa" role="status"><span className="spinner" />{etapa}</p>}

        <div className="dialog-actions">
          <button type="button" className="btn" onClick={aoFechar} disabled={ocupado}>Cancelar</button>
          <button type="submit" className="btn btn-primary" disabled={ocupado || !podeEnviar}>
            {substituir ? 'Substituir fluxograma' : modo === 'ia' ? 'Gerar fluxograma' : 'Criar e abrir'}
          </button>
        </div>
      </form>
    </div>
  );
}
