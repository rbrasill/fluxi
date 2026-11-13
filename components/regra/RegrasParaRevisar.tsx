'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Icone } from '@/components/Icone';
import { useEu } from '@/lib/auth/eu';
import { regrasParaRevisar } from '@/lib/regras';

// O aviso do Início (decisão 89): as regras que a Maia sugeriu e esperam a confirmação de quem está logado
// (quem foi escolhido para confirmar as regras do processo; administradores veem todos os processos).

export function RegrasParaRevisar() {
  const eu = useEu();
  const [lista, setLista] = useState<{ id: string; nome: string; sugeridas: number }[]>([]);
  useEffect(() => { regrasParaRevisar().then(setLista).catch(() => setLista([])); }, []);
  if (!eu?.enabled || !lista.length) return null; // sem login (desenvolvimento) não há "você"
  const total = lista.reduce((n, p) => n + p.sugeridas, 0);
  const um = lista.length === 1 ? lista[0] : null;
  return (
    <div className="entrevistas-pendentes regras-pendentes" role="status">
      <Icone nome="balanca" tamanho={18} />
      <span>
        {um
          ? <>A Maia sugeriu <strong>{total} {total === 1 ? 'regra de negócio' : 'regras de negócio'}</strong> em <strong>{um.nome}</strong> e {total === 1 ? 'ela espera' : 'elas esperam'} a sua confirmação.</>
          : <>Há <strong>{total} regras de negócio</strong> sugeridas pela Maia esperando a sua confirmação: {lista.map((p) => <Link key={p.id} href={`/app/processos/${p.id}#regras`} className="link-acao">{p.nome} ({p.sugeridas})</Link>).reduce<React.ReactNode[]>((a, x, i) => (i ? [...a, ', ', x] : [x]), [])}.</>}
      </span>
      {um && <Link className="btn btn-primary" href={`/app/processos/${um.id}#regras`}>Revisar regras</Link>}
    </div>
  );
}
