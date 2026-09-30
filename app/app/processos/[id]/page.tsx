'use client';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Icone } from '@/components/Icone';
import { NovoFluxograma } from '@/components/NovoFluxograma';
import { creditos as buscarCreditos } from '@/lib/fluxogramas';
import { formatarTempo } from '@/lib/gravacoes';
import { criarPop } from '@/lib/pops';
import { atualizarProcesso, excluirProcesso, obterProcesso, type Processo } from '@/lib/processos';

const ETAPA: Record<string, string> = { transcrevendo: 'Transcrevendo', analisando: 'IA escrevendo', pronto: 'POP gerado', erro: 'Erro na IA' };

export default function ProcessoPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [p, setP] = useState<Processo | null | undefined>(undefined);
  const [nome, setNome] = useState('');
  const [area, setArea] = useState('');
  const [novoFluxo, setNovoFluxo] = useState(false);
  const [creditos, setCreditos] = useState<number | null>(null);
  const [criandoPop, setCriandoPop] = useState(false);

  useEffect(() => {
    obterProcesso(id).then((d) => { setP(d); setNome(d.nome); setArea(d.area); }).catch(() => setP(null));
    buscarCreditos().then((c) => setCreditos(c.creditos)).catch(() => {});
  }, [id]);

  if (p === undefined) return <div className="page"><p className="notice">Carregando…</p></div>;
  if (p === null) return <div className="page"><div className="empty"><h2>Processo não encontrado</h2><Link href="/app/processos" className="btn btn-primary">Voltar</Link></div></div>;

  async function novoPop() {
    setCriandoPop(true);
    try {
      const { id: popId } = await criarPop({ processo_id: p!.id, nome: p!.nome, fluxograma_id: p!.fluxogramas.length === 1 ? p!.fluxogramas[0].id : undefined });
      router.push(`/app/pops/${popId}`);
    } catch {
      setCriandoPop(false);
      alert('Não foi possível criar o POP.');
    }
  }

  async function excluir() {
    if (!confirm(`Excluir o processo "${p!.nome}"? Os fluxogramas, gravações e POPs não são apagados: ficam em suas listas, sem processo.`)) return;
    await excluirProcesso(p!.id);
    router.push('/app/processos');
  }

  const salvar = (dados: { nome?: string; area?: string }) => void atualizarProcesso(p.id, dados);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <Link href="/app/processos" className="voltar"><Icone nome="voltar" tamanho={16} />Processos</Link>
          <input className="titulo-editavel" value={nome} onChange={(e) => setNome(e.target.value)} aria-label="Nome do processo"
            onBlur={() => nome.trim() && nome !== p.nome && salvar({ nome: nome.trim() })} />
          <p className="processo-meta">
            <span className="code">{p.codigo}</span>
            <input className="area-editavel" value={area} onChange={(e) => setArea(e.target.value)} placeholder="Área do processo" aria-label="Área"
              onBlur={() => area !== p.area && salvar({ area: area.trim() })} />
          </p>
        </div>
        <div className="actions">
          <button className="btn btn-ghost btn-icon" aria-label="Excluir processo" title="Excluir processo" onClick={excluir}><Icone nome="lixo" tamanho={16} /></button>
        </div>
      </div>

      <section className="secao-processo">
        <div className="secao-head">
          <h2><Icone nome="tela" tamanho={18} />Gravações e transcrições</h2>
          <Link href={`/app/gravacoes/nova?processo=${p.id}`} className="btn btn-gravar"><span className="rec-dot" />Nova gravação</Link>
        </div>
        {p.gravacoes.length === 0 && <p className="notice">Grave a tela narrando o processo. A IA transcreve e escreve o POP e o fluxograma a partir dela.</p>}
        <div className="lista-pops">
          {p.gravacoes.map((g) => (
            <Link key={g.id} href={`/app/gravacoes/${g.id}`} className="linha-pop">
              <span className="pop-icone"><Icone nome="tela" tamanho={20} /></span>
              <span className="pop-nome">
                <strong>{g.nome}</strong>
                <span>{g.duracao_ms ? formatarTempo(g.duracao_ms) : '--:--'} · {g.total_marcacoes} {g.total_marcacoes === 1 ? 'tela' : 'telas'}{g.transcrita ? ' · transcrita' : ''}</span>
              </span>
              {ETAPA[g.processamento] && <span className={`tag-status st-${g.processamento}`}>{ETAPA[g.processamento]}</span>}
              <span className="notice">{new Date(g.criado_em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="secao-processo">
        <div className="secao-head">
          <h2><Icone nome="fluxo" tamanho={18} />Fluxogramas</h2>
          <button className="btn" onClick={() => setNovoFluxo(true)}><Icone nome="mais" />Novo fluxograma</button>
        </div>
        {p.fluxogramas.length === 0 && <p className="notice">Nenhum fluxograma ainda.</p>}
        <div className="grid">
          {p.fluxogramas.map((f) => (
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
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="secao-processo">
        <div className="secao-head">
          <h2><Icone nome="pop" tamanho={18} />POPs</h2>
          <button className="btn" onClick={novoPop} disabled={criandoPop}><Icone nome="mais" />{criandoPop ? 'Criando…' : 'Novo POP'}</button>
        </div>
        {p.pops.length === 0 && <p className="notice">Nenhum POP ainda. Crie em branco ou gere a partir de uma gravação.</p>}
        <div className="lista-pops">
          {p.pops.map((o) => (
            <article key={o.id} className="linha-pop">
              <span className="pop-icone"><Icone nome="pop" tamanho={20} /></span>
              <Link href={`/app/pops/${o.id}`} className="pop-nome">
                <strong>{o.nome}</strong>
                <span>{o.identificacao || 'Sem identificação'} · Versão {o.versao}</span>
              </Link>
              <span className="code">{o.codigo}</span>
              <a className="btn" href={`/api/pops/${o.id}/docx`}><Icone nome="baixar" tamanho={16} />DOCX</a>
            </article>
          ))}
        </div>
      </section>

      {novoFluxo && (
        <NovoFluxograma
          creditos={creditos}
          processoId={p.id}
          aoFechar={() => setNovoFluxo(false)}
          aoCriar={(fid) => router.push(`/app/fluxogramas/${fid}`)}
        />
      )}
    </div>
  );
}
