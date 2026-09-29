'use client';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { Icone } from '@/components/Icone';
import { PlayerSegmentos } from '@/components/gravacao/PlayerSegmentos';
import { criarPop } from '@/lib/pops';
import { atualizarGravacao, atualizarMarcacao, excluirMarcacao, formatarTempo, obterGravacao, type Gravacao, type Marcacao } from '@/lib/gravacoes';

function CartaoTela({ m, n, gravacaoId, aoIr, aoExcluir }: { m: Marcacao; n: number; gravacaoId: string; aoIr: () => void; aoExcluir: () => void }) {
  const [instrucao, setInstrucao] = useState(m.instrucao ?? '');
  const [incluir, setIncluir] = useState(m.incluir_no_pop);
  const [salvo, setSalvo] = useState<'' | 'salvando' | 'ok' | 'erro'>('');

  async function salvar(dados: { instrucao?: string | null; incluir_no_pop?: boolean }) {
    setSalvo('salvando');
    try {
      await atualizarMarcacao(gravacaoId, m.id, dados);
      setSalvo('ok');
    } catch {
      setSalvo('erro');
    }
  }

  return (
    <article className={`tela-cartao ${incluir ? '' : 'excluida'}`}>
      <a href={m.imagem_url ?? '#'} target="_blank" rel="noreferrer" className="tela-img">
        {m.imagem_url ? <img src={m.imagem_url} alt={`Tela ${n}`} /> : <span>Imagem indisponível</span>}
        <span className="tela-num">{n}</span>
      </a>
      <div className="tela-corpo">
        <div className="tela-meta">
          <button className="btn btn-ghost" onClick={aoIr} title="Ver este momento no vídeo"><Icone nome="play" tamanho={14} />{formatarTempo(m.tempo_ms)}</button>
          <label className="check">
            <input type="checkbox" checked={incluir} onChange={(e) => { setIncluir(e.target.checked); void salvar({ incluir_no_pop: e.target.checked }); }} />
            Incluir no POP
          </label>
          <button className="btn btn-ghost btn-icon" aria-label="Excluir tela" title="Excluir tela" onClick={aoExcluir}><Icone nome="lixo" tamanho={16} /></button>
        </div>
        <label className="field">
          Instrução do passo
          <textarea
            rows={3}
            value={instrucao}
            onChange={(e) => setInstrucao(e.target.value)}
            onBlur={() => instrucao !== (m.instrucao ?? '') && void salvar({ instrucao: instrucao.trim() || null })}
            placeholder={m.instrucao_ia ?? 'Descreva o que fazer nesta tela. Se ficar vazio, a IA sugere a partir da narração.'}
          />
        </label>
        {salvo && <span className={`salvo salvo-${salvo}`}>{salvo === 'salvando' ? 'Salvando…' : salvo === 'ok' ? 'Salvo' : 'Erro ao salvar'}</span>}
      </div>
    </article>
  );
}

function Detalhe() {
  const { id } = useParams<{ id: string }>();
  const falhas = useSearchParams().get('falhas');
  const [g, setG] = useState<Gravacao | null | undefined>(undefined);
  const [nome, setNome] = useState('');
  const [irPara, setIrPara] = useState<{ ms: number; n: number } | null>(null);
  const [criandoPop, setCriandoPop] = useState(false);
  const router = useRouter();

  useEffect(() => {
    obterGravacao(id).then((d) => { setG(d); setNome(d.nome); }).catch(() => setG(null));
  }, [id]);

  if (g === undefined) return <div className="page"><p className="notice">Carregando…</p></div>;
  if (g === null) {
    return (
      <div className="page"><div className="empty"><h2>Gravação não encontrada</h2><Link href="/app/gravacoes" className="btn btn-primary">Voltar</Link></div></div>
    );
  }

  const incluidas = g.marcacoes.filter((m) => m.incluir_no_pop).length;

  async function criarPopDaGravacao() {
    setCriandoPop(true);
    try {
      const { id: popId } = await criarPop({ gravacao_id: g!.id });
      router.push(`/app/pops/${popId}`);
    } catch {
      setCriandoPop(false);
      alert('Não foi possível criar o POP.');
    }
  }

  async function remover(m: Marcacao) {
    if (!confirm('Excluir esta tela marcada?')) return;
    await excluirMarcacao(g!.id, m.id);
    setG({ ...g!, marcacoes: g!.marcacoes.filter((x) => x.id !== m.id) });
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <Link href="/app/gravacoes" className="voltar"><Icone nome="voltar" tamanho={16} />Gravações</Link>
          <input
            className="titulo-editavel"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            onBlur={() => nome.trim() && nome !== g.nome && void atualizarGravacao(g.id, { nome: nome.trim() })}
            aria-label="Nome da gravação"
          />
          <p>{g.duracao_ms ? formatarTempo(g.duracao_ms) : '--:--'} de gravação · {g.marcacoes.length} telas marcadas · {incluidas} no POP</p>
        </div>
        <div className="actions">
          <button className="btn btn-primary" onClick={criarPopDaGravacao} disabled={criandoPop || incluidas === 0} title={incluidas === 0 ? 'Marque ao menos uma tela como “Incluir no POP”' : undefined}>
            <Icone nome="pop" tamanho={16} />{criandoPop ? 'Criando POP…' : 'Criar POP com estas telas'}
          </button>
        </div>
      </div>
      {(falhas || g.status === 'erro') && <div className="aviso erro">Parte dos arquivos não foi enviada (conexão instável). O que foi salvo está abaixo.</div>}

      <div className="grav-layout">
        <PlayerSegmentos segmentos={g.segmentos} irPara={irPara} marcacoes={g.marcacoes.map((m) => m.tempo_ms)} />
        <section className="grav-telas">
          <h2>Telas para o POP</h2>
          {g.marcacoes.length === 0 && <p className="notice">Nenhuma tela foi marcada nesta gravação.</p>}
          {g.marcacoes.map((m, i) => (
            <CartaoTela key={m.id} m={m} n={i + 1} gravacaoId={g.id} aoIr={() => setIrPara({ ms: m.tempo_ms, n: Date.now() })} aoExcluir={() => remover(m)} />
          ))}
        </section>
      </div>
    </div>
  );
}

export default function GravacaoPage() {
  return <Suspense><Detalhe /></Suspense>;
}
