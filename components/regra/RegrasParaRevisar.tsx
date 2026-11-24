'use client';
import Link from 'next/link';
import { Icone } from '@/components/Icone';
import { useRegrasPendentes } from '@/lib/regras-pendentes';

// O aviso do Início (decisões 89 e 108): as regras sugeridas pela Maia que esperam a confirmação de quem está logado
// (a pessoa escolhida para confirmar as regras do processo; administradores, nos processos sem ninguém escolhido) e,
// para administradores, os pedidos de ajuste. Atualiza sozinho, junto com o selo do menu.

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

export function RegrasParaRevisar() {
  const lista = useRegrasPendentes();
  if (!lista?.length) return null;
  const sugeridas = lista.reduce((n, p) => n + p.sugeridas, 0);
  const ajustes = lista.reduce((n, p) => n + p.ajustes, 0);
  const um = lista.length === 1 ? lista[0] : null;
  const oQue = [
    sugeridas && <><strong>{plural(sugeridas, 'regra de negócio', 'regras de negócio')}</strong> {sugeridas === 1 ? 'espera' : 'esperam'} a sua confirmação</>,
    ajustes && <><strong>{plural(ajustes, 'pedido de ajuste', 'pedidos de ajuste')}</strong> {ajustes === 1 ? 'espera' : 'esperam'} você</>,
  ].filter(Boolean);
  return (
    <div className="entrevistas-pendentes regras-pendentes" role="status">
      <Icone nome="balanca" tamanho={18} />
      <span>
        {oQue.map((x, i) => <span key={i}>{i ? ' e ' : ''}{x}</span>)}
        {um
          ? <> em <strong>{um.nome}</strong>.</>
          : <>: {lista.map((p) => <Link key={p.id} href={`/app/processos/${p.id}#regras`} className="link-acao">{p.nome} ({p.sugeridas + p.ajustes})</Link>).reduce<React.ReactNode[]>((a, x, i) => (i ? [...a, ', ', x] : [x]), [])}.</>}
      </span>
      {um && <Link className="btn btn-primary" href={`/app/processos/${um.id}#regras`}>Revisar regras</Link>}
    </div>
  );
}
