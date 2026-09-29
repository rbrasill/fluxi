'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Icone } from '@/components/Icone';
import { listarGravacoes, type GravacaoResumo } from '@/lib/gravacoes';
import { listar as listarFluxogramas, type FluxogramaResumo } from '@/lib/fluxogramas';
import { criarPop, excluirPop, listarPops, type PopResumo } from '@/lib/pops';

export default function PopsPage() {
  const router = useRouter();
  const [itens, setItens] = useState<PopResumo[] | null>(null);
  const [erro, setErro] = useState('');
  const [novo, setNovo] = useState(false);
  const [origem, setOrigem] = useState<'branco' | 'gravacao'>('branco');
  const [gravacoes, setGravacoes] = useState<GravacaoResumo[]>([]);
  const [fluxogramas, setFluxogramas] = useState<FluxogramaResumo[]>([]);
  const [gravacaoId, setGravacaoId] = useState('');
  const [fluxogramaId, setFluxogramaId] = useState('');
  const [nome, setNome] = useState('');
  const [criando, setCriando] = useState(false);

  const atualizar = () => listarPops().then(setItens).catch((e) => { setErro(e.message); setItens([]); });
  useEffect(() => { atualizar(); }, []);

  function abrirNovo() {
    setNovo(true);
    listarGravacoes().then((g) => setGravacoes(g.filter((x) => x.total_marcacoes > 0))).catch(() => {});
    listarFluxogramas().then(setFluxogramas).catch(() => {});
  }

  async function criar(e: React.FormEvent) {
    e.preventDefault();
    setCriando(true);
    try {
      const { id } = await criarPop({
        nome: nome.trim() || undefined,
        gravacao_id: origem === 'gravacao' && gravacaoId ? gravacaoId : undefined,
        fluxograma_id: fluxogramaId || undefined,
      });
      router.push(`/app/pops/${id}`);
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao criar');
      setCriando(false);
    }
  }

  async function onExcluir(p: PopResumo) {
    if (!confirm(`Excluir o POP "${p.nome}"?`)) return;
    await excluirPop(p.id);
    atualizar();
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>POPs</h1>
          <p>Procedimentos Operacionais Padrão no modelo INC v3, prontos para baixar em Word.</p>
        </div>
        <div className="actions">
          <button className="btn btn-primary" onClick={abrirNovo}><Icone nome="mais" />Novo POP</button>
        </div>
      </div>
      {erro && <div className="aviso erro">{erro}</div>}
      {itens === null && <p className="notice">Carregando…</p>}
      {itens?.length === 0 && !erro && (
        <div className="empty">
          <h2>Nenhum POP ainda</h2>
          <p>Comece em branco ou a partir de uma gravação de tela: cada tela marcada vira um passo ilustrado.</p>
          <button className="btn btn-primary" onClick={abrirNovo}><Icone nome="mais" />Criar o primeiro</button>
        </div>
      )}
      <div className="lista-pops">
        {itens?.map((p) => (
          <article key={p.id} className="linha-pop">
            <span className="pop-icone"><Icone nome="pop" tamanho={20} /></span>
            <Link href={`/app/pops/${p.id}`} className="pop-nome">
              <strong>{p.nome}</strong>
              <span>{p.identificacao || 'Sem identificação'} · Versão {p.versao}</span>
            </Link>
            <span className="code">{p.codigo}</span>
            <span className="notice">{new Date(p.atualizado_em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</span>
            <a className="btn" href={`/api/pops/${p.id}/docx`}><Icone nome="baixar" tamanho={16} />DOCX</a>
            <button className="btn btn-ghost btn-icon" aria-label="Excluir" title="Excluir" onClick={() => onExcluir(p)}><Icone nome="lixo" tamanho={16} /></button>
          </article>
        ))}
      </div>

      {novo && (
        <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="novo-pop" onClick={() => !criando && setNovo(false)}>
          <form className="dialog dialog-lg" onClick={(e) => e.stopPropagation()} onSubmit={criar}>
            <h2 id="novo-pop">Novo POP</h2>
            <div className="options">
              <button type="button" className="option" aria-pressed={origem === 'branco'} onClick={() => setOrigem('branco')}>
                <strong>Em branco</strong><span>Preencha as seções do modelo INC v3.</span>
              </button>
              <button type="button" className="option" aria-pressed={origem === 'gravacao'} onClick={() => setOrigem('gravacao')}>
                <strong><Icone nome="tela" tamanho={14} /> A partir de uma gravação</strong><span>As telas marcadas viram passos com imagem.</span>
              </button>
            </div>
            {origem === 'gravacao' && (
              <label className="field">
                Gravação
                <select value={gravacaoId} onChange={(e) => setGravacaoId(e.target.value)} required>
                  <option value="">Escolha…</option>
                  {gravacoes.map((g) => <option key={g.id} value={g.id}>{g.nome} ({g.total_marcacoes} telas)</option>)}
                </select>
                {gravacoes.length === 0 && <span className="notice">Nenhuma gravação com telas marcadas.</span>}
              </label>
            )}
            <label className="field">
              Fluxograma do processo <span className="opcional">· opcional; o POP usa o mesmo código e o link “Abrir diagrama”</span>
              <select value={fluxogramaId} onChange={(e) => setFluxogramaId(e.target.value)}>
                <option value="">Nenhum</option>
                {fluxogramas.map((f) => <option key={f.id} value={f.id}>{f.nome} ({f.codigo})</option>)}
              </select>
            </label>
            <label className="field">
              Nome do procedimento <span className="opcional">· opcional</span>
              <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Aprovação de proposta comercial" />
            </label>
            <div className="dialog-actions">
              <button type="button" className="btn" onClick={() => setNovo(false)} disabled={criando}>Cancelar</button>
              <button type="submit" className="btn btn-primary" disabled={criando || (origem === 'gravacao' && !gravacaoId)}>{criando ? 'Criando…' : 'Criar e editar'}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
