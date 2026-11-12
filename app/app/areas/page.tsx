'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { CartaoArea } from '@/components/CartaoArea';
import { DialogoNome } from '@/components/DialogoNome';
import { Icone } from '@/components/Icone';
import { criarArea, listarAreas, porOrganizacao, type AreaResumo } from '@/lib/areas';
import { listarOrganizacoes, type OrganizacaoResumo } from '@/lib/organizacoes';

// As áreas (setores) de todas as organizações, porta de entrada do menu. Com mais de uma organização,
// ficam agrupadas por ela; a estrutura completa continua em Organizações.
export default function AreasPage() {
  const router = useRouter();
  const [areas, setAreas] = useState<AreaResumo[] | null>(null);
  const [orgs, setOrgs] = useState<OrganizacaoResumo[]>([]);
  const [orgNova, setOrgNova] = useState('');
  const [nova, setNova] = useState(false);
  const [erro, setErro] = useState('');

  useEffect(() => {
    Promise.all([listarAreas(), listarOrganizacoes()])
      .then(([a, o]) => { setAreas(a); setOrgs(o); setOrgNova(o[0]?.id ?? ''); })
      .catch((e) => { setErro(e.message); setAreas([]); });
  }, []);

  const grupos = porOrganizacao(areas ?? []);
  const agrupar = grupos.length > 1;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Áreas</h1>
          <p>Os setores da empresa. Cada área reúne os seus processos, e cada processo, o fluxograma e os POPs.</p>
        </div>
        {orgs.length > 0 && (
          <div className="actions">
            <button className="btn btn-primary" onClick={() => setNova(true)}><Icone nome="mais" />Nova área</button>
          </div>
        )}
      </div>
      {erro && <div className="aviso erro">{erro}</div>}
      {areas === null && <p className="notice">Carregando…</p>}
      {areas?.length === 0 && !erro && (
        <div className="empty">
          <h2>Nenhuma área ainda</h2>
          {orgs.length > 0
            ? <>
                <p>Crie as áreas da empresa (Comercial, Financeiro, Jurídico…) e, dentro delas, os processos.</p>
                <button className="btn btn-primary" onClick={() => setNova(true)}><Icone nome="mais" />Criar a primeira</button>
              </>
            : <>
                <p>Primeiro cadastre a organização (a empresa); depois, as áreas dela.</p>
                <Link href="/app/organizacoes" className="btn btn-primary">Ir para Organizações</Link>
              </>}
        </div>
      )}
      {grupos.map(([org, lista]) => {
        const orgId = lista[0]?.organizacao?.id;
        return (
          <section key={org} className={agrupar ? 'secao-areas' : undefined} aria-label={agrupar ? org : undefined}>
            {agrupar && (
              <h2 className="secao-areas-titulo">
                {orgId ? <Link href={`/app/organizacoes/${orgId}`}>{org}</Link> : org}
              </h2>
            )}
            <div className="grade-areas">
              {lista.map((a) => <CartaoArea key={a.id} id={a.id} nome={a.nome} totalProcessos={a.total_processos} />)}
            </div>
          </section>
        );
      })}
      {nova && (
        <DialogoNome titulo="Nova área" rotulo="Nome da área" exemplo="Ex.: Comercial" aoFechar={() => setNova(false)}
          extra={orgs.length > 1 && (
            <label className="field">Organização
              <select value={orgNova} onChange={(e) => setOrgNova(e.target.value)}>
                {orgs.map((o) => <option key={o.id} value={o.id}>{o.nome}</option>)}
              </select>
            </label>
          )}
          aviso={orgs.length === 1 && <>Entra em <strong>{orgs[0].nome}</strong>.</>}
          aoCriar={async (n) => { const a = await criarArea({ nome: n, organizacao_id: orgNova }); router.push(`/app/areas/${a.id}`); }} />
      )}
    </div>
  );
}
