'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Icone } from '@/components/Icone';
import { criarArea, listarAreas, type AreaResumo } from '@/lib/areas';

export default function AreasPage() {
  const router = useRouter();
  const [itens, setItens] = useState<AreaResumo[] | null>(null);
  const [erro, setErro] = useState('');
  const [nova, setNova] = useState(false);
  const [nome, setNome] = useState('');
  const [criando, setCriando] = useState(false);

  useEffect(() => { listarAreas().then(setItens).catch((e) => { setErro(e.message); setItens([]); }); }, []);

  async function criar(e: React.FormEvent) {
    e.preventDefault();
    setCriando(true);
    setErro('');
    try {
      const a = await criarArea({ nome: nome.trim() });
      router.push(`/app/areas/${a.id}`);
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao criar');
      setCriando(false);
    }
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Áreas</h1>
          <p>Cada área reúne os processos dela, e cada processo reúne suas gravações, fluxogramas e POPs.</p>
        </div>
        <div className="actions">
          <button className="btn btn-primary" onClick={() => setNova(true)}><Icone nome="mais" />Nova área</button>
        </div>
      </div>
      {erro && !nova && <div className="aviso erro">{erro}</div>}
      {itens === null && <p className="notice">Carregando…</p>}
      {itens?.length === 0 && !erro && (
        <div className="empty">
          <h2>Nenhuma área ainda</h2>
          <p>Comece pelas áreas da empresa (Comercial, Financeiro, Jurídico…). Depois, crie os processos dentro de cada uma.</p>
          <button className="btn btn-primary" onClick={() => setNova(true)}><Icone nome="mais" />Criar a primeira</button>
        </div>
      )}
      <div className="grid grid-areas">
        {itens?.map((a) => (
          <Link key={a.id} href={`/app/areas/${a.id}`} className="card card-area">
            <span className="pop-icone"><Icone nome="areas" tamanho={22} /></span>
            <strong>{a.nome}</strong>
            <span className="notice">{a.total_processos} {a.total_processos === 1 ? 'processo' : 'processos'}</span>
          </Link>
        ))}
      </div>

      {nova && (
        <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="nova-area" onClick={() => !criando && setNova(false)}>
          <form className="dialog" onClick={(e) => e.stopPropagation()} onSubmit={criar}>
            <h2 id="nova-area">Nova área</h2>
            <label className="field">
              Nome da área
              <input autoFocus required value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Comercial" />
            </label>
            {erro && <p className="form-erro" role="alert">{erro}</p>}
            <div className="dialog-actions">
              <button type="button" className="btn" onClick={() => setNova(false)} disabled={criando}>Cancelar</button>
              <button type="submit" className="btn btn-primary" disabled={criando || !nome.trim()}>{criando ? 'Criando…' : 'Criar e abrir'}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
