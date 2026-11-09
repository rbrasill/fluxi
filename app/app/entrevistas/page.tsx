'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Icone } from '@/components/Icone';
import { avisar, confirmar } from '@/components/Dialogos';
import { ROTULO_STATUS } from '@/lib/entrevista/topicos';
import { criarEntrevista, excluirEntrevista, listarEntrevistas, type EntrevistaResumo } from '@/lib/entrevistas';

// Entrevistas com a Maia (decisão 41): fora do processo; cada uma tem só um tema e um contexto.
// Sem custos nem indicadores aqui (decisão 52): isso fica no Painel da Maia, para administradores.

const data = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const duracao = (s: number) => (s >= 60 ? `${Math.round(s / 60)} min` : `${Math.round(s)} s`);

export default function EntrevistasPage() {
  const router = useRouter();
  const [lista, setLista] = useState<EntrevistaResumo[] | null>(null);
  const [tema, setTema] = useState('');
  const [contexto, setContexto] = useState('');
  const [abrindo, setAbrindo] = useState(false);

  const carregar = () => listarEntrevistas().then(setLista).catch(() => setLista([]));
  useEffect(() => { void carregar(); }, []);

  async function nova(e: React.FormEvent) {
    e.preventDefault();
    setAbrindo(true);
    try {
      const { id } = await criarEntrevista({ tema, contexto: contexto || undefined });
      router.push(`/app/entrevistas/${id}`);
    } catch (err) {
      setAbrindo(false);
      void avisar('Não foi possível abrir a entrevista.', err instanceof Error ? err.message : 'Tente de novo em instantes.');
    }
  }

  async function excluir(x: EntrevistaResumo) {
    if (!(await confirmar({ titulo: 'Excluir esta entrevista?', mensagem: 'A conversa, o áudio e o resultado são apagados.', acao: 'Excluir', perigo: true }))) return;
    try { await excluirEntrevista(x.id); await carregar(); } catch { void avisar('Não foi possível excluir a entrevista.', 'Tente de novo em instantes.'); }
  }

  return (
    <div className="page page-estreita">
      <div className="page-head">
        <div>
          <h1>Entrevista com IA</h1>
          <p>A Maia entrevista por voz quem executa um processo, como numa ligação, e no fim escreve a descrição, uma ficha e o que ficou em aberto. Ainda em teste: não cria nem altera processos.</p>
        </div>
      </div>

      <form className="cartao" onSubmit={nova}>
        <h3 className="sem-margem">Nova entrevista</h3>
        <label className="field">
          <span>Qual processo vai ser mapeado?</span>
          <input value={tema} onChange={(e) => setTema(e.target.value)} placeholder="Ex.: Pedido de compra sem contrato" maxLength={200} required minLength={3} />
        </label>
        <label className="field">
          <span>Contexto (opcional)</span>
          <textarea value={contexto} onChange={(e) => setContexto(e.target.value)} rows={3} maxLength={2000} placeholder="Ex.: área de Suprimentos da INC; quem vai responder é a compradora; usam o Mega ERP." />
        </label>
        <div className="fluxo-acoes">
          <button className="btn btn-primary" disabled={abrindo || tema.trim().length < 3}><Icone nome="microfone" tamanho={16} />{abrindo ? 'Abrindo…' : 'Preparar entrevista'}</button>
        </div>
      </form>

      {lista && lista.length > 0 && (
        <section className="secao-processo">
          <div className="secao-head"><h2><Icone nome="conversa" tamanho={18} />Entrevistas</h2></div>
          <div className="lista-pops">
            {lista.map((x) => (
              <article key={x.id} className="linha-pop">
                <span className="pop-icone icone-entrevista"><Icone nome="conversa" tamanho={20} /></span>
                <Link href={`/app/entrevistas/${x.id}`} className="pop-nome">
                  <strong>{x.tema || 'Entrevista'}</strong>
                  <span>{x.entrevistado ? `${x.entrevistado} · ` : ''}{data(x.criado_em)} · {x.status === 'em_andamento' && x.falas > 0 ? 'Pausada' : ROTULO_STATUS[x.status]} · {x.falas} {x.falas === 1 ? 'fala' : 'falas'}{x.duracao_s ? ` · ${duracao(x.duracao_s)}` : ''}</span>
                </Link>
                <button type="button" className="btn btn-ghost btn-excluir" onClick={() => excluir(x)} title="Excluir a entrevista"><Icone nome="lixo" tamanho={16} />Excluir</button>
                <Link className="btn btn-primary" href={`/app/entrevistas/${x.id}`}>{x.status === 'em_andamento' ? 'Continuar' : 'Abrir'}</Link>
              </article>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
