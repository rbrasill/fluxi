'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Icone } from '@/components/Icone';
import { avisar, confirmar } from '@/components/Dialogos';
import { ROTULO_STATUS } from '@/lib/entrevista/topicos';
import { criarEntrevista, excluirEntrevista, listarEntrevistas, type EntrevistaResumo } from '@/lib/entrevistas';

// Entrevistas com a IA de um processo (decisão 39): abre uma nova e lista as anteriores.

const data = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

export function EntrevistasDoProcesso({ processoId, arquivado }: { processoId: string; arquivado: boolean }) {
  const router = useRouter();
  const [lista, setLista] = useState<EntrevistaResumo[] | null>(null);
  const [abrindo, setAbrindo] = useState(false);

  const carregar = () => listarEntrevistas(processoId).then(setLista).catch(() => setLista([]));
  useEffect(() => { void carregar(); }, [processoId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function nova() {
    setAbrindo(true);
    try {
      const { id } = await criarEntrevista(processoId);
      router.push(`/app/entrevistas/${id}`);
    } catch (e) {
      setAbrindo(false);
      void avisar('Não foi possível abrir a entrevista.', e instanceof Error ? e.message : 'Tente de novo em instantes.');
    }
  }

  async function excluir(e: EntrevistaResumo) {
    if (!(await confirmar({ titulo: 'Excluir esta entrevista?', mensagem: 'A conversa, o áudio e o resultado são apagados. O que já foi aplicado ao processo (descrição, fluxograma) fica.', acao: 'Excluir', perigo: true }))) return;
    try { await excluirEntrevista(e.id); await carregar(); } catch { void avisar('Não foi possível excluir a entrevista.', 'Tente de novo em instantes.'); }
  }

  return (
    <div className="cartao entrevistas-cartao">
      <div className="sec-titulo">
        <h3><Icone nome="microfone" tamanho={18} />Entrevista com IA</h3>
        {!arquivado && (
          <button className="btn btn-primary" onClick={nova} disabled={abrindo} title="A IA conversa por voz com quem executa o processo e escreve a descrição">
            <Icone nome="ia" tamanho={16} />{abrindo ? 'Abrindo…' : 'Nova entrevista'}
          </button>
        )}
      </div>
      <p className="notice">A IA entrevista por voz quem executa o processo (perguntas sobre etapas, responsáveis, sistemas, regras e exceções) e, no fim, escreve a descrição e uma ficha do processo. Protótipo: use fones de ouvido e um lugar silencioso.</p>
      {lista && lista.length > 0 && (
        <div className="lista-pops">
          {lista.map((e) => (
            <article key={e.id} className="linha-pop">
              <span className="pop-icone icone-entrevista"><Icone nome="conversa" tamanho={20} /></span>
              <Link href={`/app/entrevistas/${e.id}`} className="pop-nome">
                <strong>Entrevista de {data(e.criado_em)}</strong>
                <span>{ROTULO_STATUS[e.status]} · {e.perguntas} {e.perguntas === 1 ? 'pergunta' : 'perguntas'} · {e.respostas} {e.respostas === 1 ? 'resposta' : 'respostas'}</span>
              </Link>
              {!arquivado && <button type="button" className="btn btn-ghost btn-excluir" onClick={() => excluir(e)} title="Excluir a entrevista"><Icone nome="lixo" tamanho={16} />Excluir</button>}
              <Link className="btn btn-primary" href={`/app/entrevistas/${e.id}`}>{e.status === 'em_andamento' ? 'Continuar' : 'Abrir'}</Link>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
