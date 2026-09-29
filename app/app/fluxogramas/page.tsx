'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { Icone } from '@/components/Icone';
import { criar, duplicar, excluir, listar, type FluxogramaResumo } from '@/lib/fluxogramas';

type Modelo = 'branco' | 'exemplo';

export default function FluxogramasPage() {
  const router = useRouter();
  const [itens, setItens] = useState<FluxogramaResumo[] | null>(null);
  const [busca, setBusca] = useState('');
  const [novo, setNovo] = useState(false);
  const [nome, setNome] = useState('');
  const [modelo, setModelo] = useState<Modelo>('branco');
  const [criando, setCriando] = useState(false);

  const atualizar = () => setItens(listar());
  useEffect(atualizar, []);

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return (itens || []).filter((f) => !q || f.nome.toLowerCase().includes(q) || f.codigo.toLowerCase().includes(q));
  }, [itens, busca]);

  async function confirmarNovo(e: React.FormEvent) {
    e.preventDefault();
    setCriando(true);
    const xml = modelo === 'exemplo' ? await (await fetch('/drawio/exemplo-emcash.drawio')).text() : '';
    const f = criar(nome.trim() || (modelo === 'exemplo' ? 'Exemplo EmCash' : 'Novo fluxograma'), xml);
    router.push(`/app/fluxogramas/${f.id}`);
  }

  function onExcluir(f: FluxogramaResumo) {
    if (confirm(`Excluir "${f.nome}"? Essa ação não pode ser desfeita.`)) {
      excluir(f.id);
      atualizar();
    }
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Fluxogramas</h1>
          <p>Crie e edite os fluxogramas BPMN no padrão da biblioteca INC.</p>
        </div>
        <div className="actions">
          <button className="btn btn-primary" onClick={() => { setNome(''); setModelo('branco'); setNovo(true); }}>
            <Icone nome="mais" />Novo fluxograma
          </button>
        </div>
      </div>

      <label className="search">
        <Icone nome="busca" />
        <input type="search" placeholder="Buscar por nome ou código" value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Buscar fluxogramas" />
      </label>

      {itens && itens.length === 0 && (
        <div className="empty">
          <h2>Nenhum fluxograma ainda</h2>
          <p>Comece em branco ou abra o exemplo da EmCash para testar o editor com a biblioteca BPMN INC.</p>
          <button className="btn btn-primary" onClick={() => setNovo(true)}><Icone nome="mais" />Criar o primeiro</button>
        </div>
      )}

      {itens && itens.length > 0 && filtrados.length === 0 && <p className="notice">Nenhum resultado para “{busca}”.</p>}

      <div className="grid">
        {filtrados.map((f) => (
          <article key={f.id} className="card">
            <Link href={`/app/fluxogramas/${f.id}`} className="card-thumb" aria-label={`Abrir ${f.nome}`}>
              {f.miniatura ? <img src={f.miniatura} alt="" /> : <Icone nome="fluxo" tamanho={40} />}
            </Link>
            <div className="card-body">
              <Link href={`/app/fluxogramas/${f.id}`} className="card-title">{f.nome}</Link>
              <div className="card-meta">
                <span className="code">{f.codigo}</span>
                <span>Editado {new Date(f.atualizadoEm).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</span>
                <span className="card-actions">
                  <button className="btn btn-ghost btn-icon" aria-label="Duplicar" title="Duplicar" onClick={() => { duplicar(f.id); atualizar(); }}><Icone nome="copiar" tamanho={16} /></button>
                  <button className="btn btn-ghost btn-icon" aria-label="Excluir" title="Excluir" onClick={() => onExcluir(f)}><Icone nome="lixo" tamanho={16} /></button>
                </span>
              </div>
            </div>
          </article>
        ))}
      </div>

      <p className="notice">Versão de teste: os fluxogramas ficam salvos neste navegador. A gravação no banco (Supabase) entra na próxima etapa.</p>

      {novo && (
        <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="novo-titulo" onClick={() => setNovo(false)}>
          <form className="dialog" onClick={(e) => e.stopPropagation()} onSubmit={confirmarNovo}>
            <h2 id="novo-titulo">Novo fluxograma</h2>
            <label className="field">
              Nome
              <input autoFocus value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Aprovação de proposta comercial" />
            </label>
            <div className="options">
              <button type="button" className="option" aria-pressed={modelo === 'branco'} onClick={() => setModelo('branco')}>
                <strong>Em branco</strong><span>Comece do zero com a biblioteca BPMN INC.</span>
              </button>
              <button type="button" className="option" aria-pressed={modelo === 'exemplo'} onClick={() => setModelo('exemplo')}>
                <strong>Exemplo EmCash</strong><span>O fluxograma de referência, para testar.</span>
              </button>
            </div>
            <div className="dialog-actions">
              <button type="button" className="btn" onClick={() => setNovo(false)}>Cancelar</button>
              <button type="submit" className="btn btn-primary" disabled={criando}>{criando ? 'Criando…' : 'Criar e abrir'}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
