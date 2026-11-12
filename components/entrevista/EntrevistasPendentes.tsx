'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Icone } from '@/components/Icone';
import { useEu } from '@/lib/auth/eu';
import { listarEntrevistas, type EntrevistaResumo } from '@/lib/entrevistas';

// O aviso do Início (decisão 53): as entrevistas com a Maia que esperam a pessoa logada (convidadas ou pausadas).

export function EntrevistasPendentes() {
  const eu = useEu();
  const [lista, setLista] = useState<EntrevistaResumo[]>([]);
  useEffect(() => { listarEntrevistas().then(setLista).catch(() => setLista([])); }, []);
  if (!eu?.enabled) return null; // sem login (desenvolvimento) não há "você"
  const minhas = lista.filter((x) => x.entrevistado_id === eu.personId && !x.arquivado_em && (x.status === 'convidada' || x.status === 'em_andamento'));
  if (!minhas.length) return null;
  const uma = minhas.length === 1 ? minhas[0] : null;
  return (
    <div className="entrevistas-pendentes" role="status">
      <Icone nome="microfone" tamanho={18} />
      <span>
        {uma
          ? <>A Maia está esperando você para {uma.complemento_pendencias ? `fechar ${uma.complemento_pendencias} ${uma.complemento_pendencias === 1 ? 'ponto que ficou' : 'pontos que ficaram'} em aberto na entrevista` : 'a entrevista'} sobre <strong>{uma.processo?.nome ?? uma.tema}</strong>{!uma.complemento_pendencias && uma.falas > 0 ? ' (pausada)' : ''}.</>
          : <>Você tem <strong>{minhas.length} entrevistas com a Maia</strong> esperando: {minhas.map((x) => x.processo?.nome ?? x.tema).join(', ')}.</>}
      </span>
      <Link className="btn btn-primary" href={uma ? `/app/entrevistas/${uma.id}` : '/app/entrevistas'}>{uma ? (uma.falas > 0 ? 'Continuar' : 'Ligar para a Maia') : 'Ver entrevistas'}</Link>
    </div>
  );
}
