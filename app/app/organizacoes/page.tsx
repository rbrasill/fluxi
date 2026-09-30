'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { DialogoNome } from '@/components/DialogoNome';
import { Icone } from '@/components/Icone';
import { criarOrganizacao, listarOrganizacoes, type OrganizacaoResumo } from '@/lib/organizacoes';

export default function OrganizacoesPage() {
  const router = useRouter();
  const [itens, setItens] = useState<OrganizacaoResumo[] | null>(null);
  const [erro, setErro] = useState('');
  const [nova, setNova] = useState(false);

  useEffect(() => { listarOrganizacoes().then(setItens).catch((e) => { setErro(e.message); setItens([]); }); }, []);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Organizações</h1>
          <p>As empresas cujos processos você modela. Cada uma tem suas áreas, e cada área, seus processos.</p>
        </div>
        <div className="actions">
          <button className="btn btn-primary" onClick={() => setNova(true)}><Icone nome="mais" />Nova organização</button>
        </div>
      </div>
      {erro && <div className="aviso erro">{erro}</div>}
      {itens === null && <p className="notice">Carregando…</p>}
      {itens?.length === 0 && !erro && (
        <div className="empty">
          <h2>Nenhuma organização ainda</h2>
          <p>Cadastre a empresa, depois as áreas dela e os processos de cada área.</p>
          <button className="btn btn-primary" onClick={() => setNova(true)}><Icone nome="mais" />Criar a primeira</button>
        </div>
      )}
      <div className="grid grid-areas">
        {itens?.map((o) => (
          <Link key={o.id} href={`/app/organizacoes/${o.id}`} className="card card-area">
            <span className="pop-icone"><Icone nome="empresa" tamanho={22} /></span>
            <strong>{o.nome}</strong>
            <span className="notice">{o.total_areas} {o.total_areas === 1 ? 'área' : 'áreas'}</span>
          </Link>
        ))}
      </div>
      {nova && (
        <DialogoNome titulo="Nova organização" rotulo="Nome da empresa" exemplo="Ex.: INC Empreendimentos" aoFechar={() => setNova(false)}
          aoCriar={async (nome) => { const o = await criarOrganizacao(nome); router.push(`/app/organizacoes/${o.id}`); }} />
      )}
    </div>
  );
}
