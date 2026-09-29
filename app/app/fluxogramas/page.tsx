'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { Icone } from '@/components/Icone';
import { NovoFluxograma } from '@/components/NovoFluxograma';
import { creditos as buscarCreditos, duplicar, excluir, importarLocais, listar, locaisPendentes, type FluxogramaResumo } from '@/lib/fluxogramas';

export default function FluxogramasPage() {
  const router = useRouter();
  const [itens, setItens] = useState<FluxogramaResumo[] | null>(null);
  const [erro, setErro] = useState('');
  const [busca, setBusca] = useState('');
  const [novo, setNovo] = useState(false);
  const [creditos, setCreditos] = useState<number | null>(null);
  const [locais, setLocais] = useState(0);

  async function atualizar() {
    try {
      setItens(await listar());
      setErro('');
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao carregar');
      setItens([]);
    }
  }

  useEffect(() => {
    atualizar();
    buscarCreditos().then((c) => setCreditos(c.creditos)).catch(() => setCreditos(null));
    setLocais(locaisPendentes().length);
  }, []);

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return (itens || []).filter((f) => !q || f.nome.toLowerCase().includes(q) || f.codigo.toLowerCase().includes(q));
  }, [itens, busca]);

  async function onExcluir(f: FluxogramaResumo) {
    if (!confirm(`Excluir "${f.nome}"? Essa ação não pode ser desfeita.`)) return;
    await excluir(f.id);
    atualizar();
  }

  async function onImportar() {
    await importarLocais();
    setLocais(0);
    atualizar();
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Fluxogramas</h1>
          <p>Crie manualmente ou gere com IA a partir de uma descrição, transcrição ou gravação.</p>
        </div>
        <div className="actions">
          {creditos !== null && (
            <span className={`creditos ${creditos === 0 ? 'zerado' : ''}`} title="Créditos de IA disponíveis">
              <Icone nome="ia" tamanho={16} />{creditos} {creditos === 1 ? 'crédito' : 'créditos'} de IA
            </span>
          )}
          <button className="btn btn-primary" onClick={() => setNovo(true)}>
            <Icone nome="mais" />Novo fluxograma
          </button>
        </div>
      </div>

      {locais > 0 && (
        <div className="aviso">
          <span>Você tem {locais} fluxograma(s) salvos só neste navegador (versão de teste anterior).</span>
          <button className="btn" onClick={onImportar}>Enviar para a nuvem</button>
        </div>
      )}
      {erro && <div className="aviso erro">{erro}</div>}

      <label className="search">
        <Icone nome="busca" />
        <input type="search" placeholder="Buscar por nome ou código" value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Buscar fluxogramas" />
      </label>

      {itens === null && <p className="notice">Carregando…</p>}

      {itens && itens.length === 0 && !erro && (
        <div className="empty">
          <h2>Nenhum fluxograma ainda</h2>
          <p>Desenhe do zero com a biblioteca BPMN INC ou deixe a IA montar o primeiro rascunho a partir da explicação do processo.</p>
          <button className="btn btn-primary" onClick={() => setNovo(true)}><Icone nome="mais" />Criar o primeiro</button>
        </div>
      )}

      {itens && itens.length > 0 && filtrados.length === 0 && <p className="notice">Nenhum resultado para “{busca}”.</p>}

      <div className="grid">
        {filtrados.map((f) => (
          <article key={f.id} className="card">
            <Link href={`/app/fluxogramas/${f.id}`} className="card-thumb" aria-label={`Abrir ${f.nome}`}>
              {f.miniatura ? <img src={f.miniatura} alt="" /> : <Icone nome="fluxo" tamanho={40} />}
              {f.origem === 'ia' && <span className="tag-ia"><Icone nome="ia" tamanho={12} />IA</span>}
            </Link>
            <div className="card-body">
              <Link href={`/app/fluxogramas/${f.id}`} className="card-title">{f.nome}</Link>
              <div className="card-meta">
                <span className="code">{f.codigo}</span>
                <span>{new Date(f.atualizado_em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</span>
                <span className="card-actions">
                  <button className="btn btn-ghost btn-icon" aria-label="Duplicar" title="Duplicar" onClick={async () => { await duplicar(f.id); atualizar(); }}><Icone nome="copiar" tamanho={16} /></button>
                  <button className="btn btn-ghost btn-icon" aria-label="Excluir" title="Excluir" onClick={() => onExcluir(f)}><Icone nome="lixo" tamanho={16} /></button>
                </span>
              </div>
            </div>
          </article>
        ))}
      </div>

      {novo && (
        <NovoFluxograma
          creditos={creditos}
          aoFechar={() => setNovo(false)}
          aoCriar={(id, saldo) => { if (saldo !== undefined) setCreditos(saldo); router.push(`/app/fluxogramas/${id}`); }}
        />
      )}
    </div>
  );
}
