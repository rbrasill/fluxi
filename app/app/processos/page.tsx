'use client';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { Icone } from '@/components/Icone';
import { PastaProcesso } from '@/components/PastaProcesso';
import { NovoProcesso } from '@/components/NovoProcesso';
import { listarProcessos, type ProcessoResumo } from '@/lib/processos';

export default function ProcessosPage() {
  const [itens, setItens] = useState<ProcessoResumo[] | null>(null);
  const [erro, setErro] = useState('');
  const [busca, setBusca] = useState('');
  const [novo, setNovo] = useState(false);

  useEffect(() => { listarProcessos().then(setItens).catch((e) => { setErro(e.message); setItens([]); }); }, []);

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return (itens || []).filter((p) => !q || [p.nome, p.codigo, p.area?.nome ?? '', p.area?.organizacao?.nome ?? ''].some((x) => x.toLowerCase().includes(q)));
  }, [itens, busca]);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Todos os processos</h1>
          <p>Os processos de todas as organizações e áreas. Cada processo reúne o fluxograma e os POPs (com as gravações de tela de cada POP).</p>
        </div>
        <div className="actions">
          <button className="btn btn-primary" onClick={() => setNovo(true)}><Icone nome="mais" />Novo processo</button>
        </div>
      </div>
      {erro && <div className="aviso erro">{erro}</div>}

      <label className="search">
        <Icone nome="busca" />
        <input type="search" placeholder="Buscar por nome, código, organização ou área" value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Buscar processos" />
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

      <div className="pastas-processos">
        {filtrados.map((p) => <PastaProcesso key={p.id} processo={p} />)}
      </div>

      {novo && <NovoProcesso aoFechar={() => setNovo(false)} />}
    </div>
  );
}
