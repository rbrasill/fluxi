'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { Icone } from '@/components/Icone';
import { criarProcesso, listarProcessos, type ProcessoResumo } from '@/lib/processos';

export default function ProcessosPage() {
  const router = useRouter();
  const [itens, setItens] = useState<ProcessoResumo[] | null>(null);
  const [erro, setErro] = useState('');
  const [busca, setBusca] = useState('');
  const [novo, setNovo] = useState(false);
  const [nome, setNome] = useState('');
  const [area, setArea] = useState('');
  const [criando, setCriando] = useState(false);

  useEffect(() => { listarProcessos().then(setItens).catch((e) => { setErro(e.message); setItens([]); }); }, []);

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return (itens || []).filter((p) => !q || [p.nome, p.codigo, p.area].some((x) => x.toLowerCase().includes(q)));
  }, [itens, busca]);

  async function criar(e: React.FormEvent) {
    e.preventDefault();
    setCriando(true);
    try {
      const p = await criarProcesso({ nome: nome.trim(), area: area.trim() || undefined });
      router.push(`/app/processos/${p.id}`);
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao criar');
      setCriando(false);
    }
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Processos</h1>
          <p>Cada processo é uma pasta com tudo dele: gravações e transcrições, fluxogramas e POPs.</p>
        </div>
        <div className="actions">
          <button className="btn btn-primary" onClick={() => setNovo(true)}><Icone nome="mais" />Novo processo</button>
        </div>
      </div>
      {erro && <div className="aviso erro">{erro}</div>}

      <label className="search">
        <Icone nome="busca" />
        <input type="search" placeholder="Buscar por nome, código ou área" value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Buscar processos" />
      </label>

      {itens === null && <p className="notice">Carregando…</p>}
      {itens?.length === 0 && !erro && (
        <div className="empty">
          <h2>Nenhum processo ainda</h2>
          <p>Crie o processo e, dentro dele, grave a tela, gere o fluxograma e o POP.</p>
          <button className="btn btn-primary" onClick={() => setNovo(true)}><Icone nome="mais" />Criar o primeiro</button>
        </div>
      )}
      {itens && itens.length > 0 && filtrados.length === 0 && <p className="notice">Nenhum resultado para “{busca}”.</p>}

      <div className="lista-pops">
        {filtrados.map((p) => (
          <Link key={p.id} href={`/app/processos/${p.id}`} className="linha-pop linha-processo">
            <span className="pop-icone"><Icone nome="pasta" tamanho={20} /></span>
            <span className="pop-nome">
              <strong>{p.nome}</strong>
              <span>{p.area || 'Sem área'}</span>
            </span>
            <span className="contagens">
              <span title="Gravações"><Icone nome="tela" tamanho={14} />{p.total.gravacoes}</span>
              <span title="Fluxogramas"><Icone nome="fluxo" tamanho={14} />{p.total.fluxogramas}</span>
              <span title="POPs"><Icone nome="pop" tamanho={14} />{p.total.pops}</span>
            </span>
            <span className="code">{p.codigo}</span>
            <span className="notice">{new Date(p.atualizado_em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</span>
          </Link>
        ))}
      </div>

      {novo && (
        <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="novo-processo" onClick={() => !criando && setNovo(false)}>
          <form className="dialog" onClick={(e) => e.stopPropagation()} onSubmit={criar}>
            <h2 id="novo-processo">Novo processo</h2>
            <label className="field">
              Nome do processo
              <input autoFocus required value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Aprovação de proposta comercial" />
            </label>
            <label className="field">
              Área <span className="opcional">· opcional</span>
              <input value={area} onChange={(e) => setArea(e.target.value)} placeholder="Ex.: Comercial" />
            </label>
            <div className="dialog-actions">
              <button type="button" className="btn" onClick={() => setNovo(false)} disabled={criando}>Cancelar</button>
              <button type="submit" className="btn btn-primary" disabled={criando || !nome.trim()}>{criando ? 'Criando…' : 'Criar e abrir'}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
