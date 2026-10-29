'use client';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Icone } from '@/components/Icone';
import { NovoFluxograma } from '@/components/NovoFluxograma';
import { ROTULO_STATUS, formatarTempo, type StatusGravacao } from '@/lib/gravacoes';
import { SeloStatus } from '@/components/SeloStatus';
import { criarPop, type StatusPop } from '@/lib/pops';
import { listarAreas, porOrganizacao, type AreaResumo } from '@/lib/areas';
import { atualizarProcesso, excluirProcesso, obterProcesso, type Processo } from '@/lib/processos';

const ETAPA: Record<string, string> = { transcrevendo: 'Transcrevendo', analisando: 'IA escrevendo', pronto: 'POP gerado', erro: 'Erro na IA' };
const EM_ABERTO: StatusGravacao[] = ['pausada', 'gravando', 'interrompida'];

export default function ProcessoPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [p, setP] = useState<Processo | null | undefined>(undefined);
  const [nome, setNome] = useState('');
  const [areas, setAreas] = useState<AreaResumo[]>([]);
  const [novoFluxo, setNovoFluxo] = useState(false);
  const [criandoPop, setCriandoPop] = useState(false);

  useEffect(() => {
    obterProcesso(id).then((d) => { setP(d); setNome(d.nome); }).catch(() => setP(null));
    listarAreas().then(setAreas).catch(() => {});
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
    router.push(p!.area ? `/app/areas/${p!.area.id}` : '/app/organizacoes');
  }

  const salvar = (dados: { nome?: string }) => void atualizarProcesso(p.id, dados);

  async function mudarArea(areaId: string) {
    if (!areaId || areaId === p!.area_id) return;
    await atualizarProcesso(p!.id, { area_id: areaId });
    setP({ ...p!, area_id: areaId, area: areas.find((a) => a.id === areaId) ?? p!.area });
  }

  const gravacoesAbertas = p.gravacoes.filter((g) => EM_ABERTO.includes(g.status as StatusGravacao));

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <nav className="migalha" aria-label="Caminho">
            {p.area?.organizacao && <><Link href={`/app/organizacoes/${p.area.organizacao.id}`}>{p.area.organizacao.nome}</Link><span>›</span></>}
            {p.area && <Link href={`/app/areas/${p.area.id}`}>{p.area.nome}</Link>}
          </nav>
          <input className="titulo-editavel" value={nome} onChange={(e) => setNome(e.target.value)} aria-label="Nome do processo"
            onBlur={() => nome.trim() && nome !== p.nome && salvar({ nome: nome.trim() })} />
          <p className="processo-meta">
            <span className="code">{p.codigo}</span>
            <select className="select-area" value={p.area_id} onChange={(e) => void mudarArea(e.target.value)} aria-label="Área do processo" title="Mover para outra área">
              {areas.length
                ? porOrganizacao(areas).map(([org, lista]) => (
                    <optgroup key={org} label={org}>{lista.map((a) => <option key={a.id} value={a.id}>{a.nome}</option>)}</optgroup>
                  ))
                : p.area && <option value={p.area.id}>{p.area.nome}</option>}
            </select>
          </p>
        </div>
        <div className="actions">
          <button className="btn btn-ghost btn-icon" aria-label="Excluir processo" title="Excluir processo" onClick={excluir}><Icone nome="lixo" tamanho={16} /></button>
        </div>
      </div>

      {/* O produto final é o POP: ele vem primeiro. */}
      <section className="secao-processo">
        <div className="secao-head">
          <h2><Icone nome="pop" tamanho={18} />{p.pops.length > 1 ? 'POPs do processo' : 'POP do processo'}</h2>
          {p.pops.length > 0 && <button className="btn btn-ghost" onClick={novoPop} disabled={criandoPop}><Icone nome="mais" />{criandoPop ? 'Criando…' : 'Outro POP'}</button>}
        </div>
        {gravacoesAbertas.map((g) => (
          <div key={g.id} className="aviso retomar">
            <span><b>Gravação {ROTULO_STATUS[g.status as StatusGravacao].toLowerCase()}: {g.nome}</b> · {g.duracao_ms ? formatarTempo(g.duracao_ms) : '--:--'} · {g.total_marcacoes} {g.total_marcacoes === 1 ? 'tela' : 'telas'}. Tudo o que foi gravado está salvo.</span>
            <span className="aviso-acoes">
              <Link href={`/app/gravacoes/${g.id}`} className="btn">Abrir gravação</Link>
              <Link href={`/app/gravacoes/nova?continuar=${g.id}`} className="btn btn-primary"><span className="rec-dot" />Continuar gravação</Link>
            </span>
          </div>
        ))}
        {p.pops.length === 0 ? (
          <div className="comecar-pop">
            <p><strong>Este processo ainda não tem POP.</strong> Como você quer começar?</p>
            <div className="options options-3">
              <Link href={`/app/gravacoes/nova?processo=${p.id}`} className="option">
                <strong><span className="rec-dot" /> Gravar a tela <span className="recomendado">Recomendado</span></strong>
                <span>Faça o processo no sistema narrando cada passo. A IA escreve o POP e o fluxograma a partir da gravação.</span>
              </Link>
              <button type="button" className="option" onClick={novoPop} disabled={criandoPop}>
                <strong><Icone nome="pop" tamanho={14} /> {criandoPop ? 'Criando…' : 'Escrever o POP'}</strong>
                <span>Preencha o modelo do POP do zero, passo a passo.</span>
              </button>
              <button type="button" className="option" onClick={() => setNovoFluxo(true)}>
                <strong><Icone nome="fluxo" tamanho={14} /> Começar pelo fluxograma</strong>
                <span>Desenhe o fluxo (ou gere com IA a partir de uma descrição) e escreva o POP depois.</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="lista-pops">
            {p.pops.map((o) => (
              <article key={o.id} className="linha-pop pop-destaque">
                <span className="pop-icone"><Icone nome="pop" tamanho={22} /></span>
                <Link href={`/app/pops/${o.id}`} className="pop-nome">
                  <strong>{o.nome}</strong>
                  <span>{o.identificacao || 'Sem identificação'} · Versão {o.versao} · atualizado em {new Date(o.atualizado_em).toLocaleDateString('pt-BR')}</span>
                </Link>
                <SeloStatus status={o.status as StatusPop} />
                <a className="btn btn-ghost" href={`/api/pops/${o.id}/pdf`} title="Baixar PDF"><Icone nome="baixar" tamanho={16} />PDF</a>
                <a className="btn btn-ghost" href={`/api/pops/${o.id}/docx`} title="Baixar DOCX"><Icone nome="baixar" tamanho={16} />DOCX</a>
                {o.status === 'rascunho'
                  ? <Link className="btn btn-primary" href={`/app/pops/${o.id}?retomar=1`} title="Abre o POP no ponto em que você parou">Continuar</Link>
                  : <Link className="btn btn-primary" href={`/app/pops/${o.id}`}>Abrir POP</Link>}
              </article>
            ))}
          </div>
        )}
      </section>

      <h2 className="titulo-apoio">Materiais de apoio</h2>

      <section className="secao-processo secao-apoio">
        <div className="secao-head">
          <h3><Icone nome="tela" tamanho={16} />Gravações e transcrições</h3>
          <Link href={`/app/gravacoes/nova?processo=${p.id}`} className="btn"><span className="rec-dot" />Nova gravação</Link>
        </div>
        {p.gravacoes.length === 0 && <p className="notice">Nenhuma gravação. Grave a tela narrando o processo: a IA transcreve e escreve o POP e o fluxograma.</p>}
        <div className="lista-pops">
          {p.gravacoes.map((g) => (
            <Link key={g.id} href={`/app/gravacoes/${g.id}`} className="linha-pop">
              <span className="pop-icone"><Icone nome="tela" tamanho={20} /></span>
              <span className="pop-nome">
                <strong>{g.nome}</strong>
                <span>{g.duracao_ms ? formatarTempo(g.duracao_ms) : '--:--'} · {g.total_marcacoes} {g.total_marcacoes === 1 ? 'tela' : 'telas'}{g.transcrita ? ' · transcrita' : ''}</span>
              </span>
              {EM_ABERTO.includes(g.status as StatusGravacao)
                ? <span className={`tag-status st-${g.status}`}>{ROTULO_STATUS[g.status as StatusGravacao]}</span>
                : ETAPA[g.processamento] && <span className={`tag-status st-${g.processamento}`}>{ETAPA[g.processamento]}</span>}
              <span className="notice">{new Date(g.criado_em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="secao-processo secao-apoio">
        <div className="secao-head">
          <h3><Icone nome="fluxo" tamanho={16} />Fluxogramas</h3>
          <button className="btn" onClick={() => setNovoFluxo(true)}><Icone nome="mais" />Novo fluxograma</button>
        </div>
        {p.fluxogramas.length === 0 && <p className="notice">Nenhum fluxograma. O POP pode ter um link "Abrir diagrama" para o fluxograma do processo.</p>}
        <div className="lista-pops">
          {p.fluxogramas.map((f) => (
            <Link key={f.id} href={`/app/fluxogramas/${f.id}`} className="linha-pop">
              <span className="pop-icone"><Icone nome="fluxo" tamanho={20} /></span>
              <span className="pop-nome"><strong>{f.nome}</strong><span>{f.origem === 'ia' ? 'Gerado com IA · ' : ''}atualizado em {new Date(f.atualizado_em).toLocaleDateString('pt-BR')}</span></span>
              <span className="code">{f.codigo}</span>
            </Link>
          ))}
        </div>
      </section>

      {novoFluxo && (
        <NovoFluxograma
          processoId={p.id}
          aoFechar={() => setNovoFluxo(false)}
          aoCriar={(fid) => router.push(`/app/fluxogramas/${fid}`)}
        />
      )}
    </div>
  );
}
