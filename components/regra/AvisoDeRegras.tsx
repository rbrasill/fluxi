'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Icone } from '@/components/Icone';
import { totalPendente, useRegrasPendentes } from '@/lib/regras-pendentes';

// Avisos das regras de negócio esperando a pessoa (decisão 108): o selo no menu e o aviso flutuante.

const CHAVE = 'incflow:regras-avisadas';
const ler = () => { try { return Number(sessionStorage.getItem(CHAVE) ?? '-1'); } catch { return -1; } };
const gravar = (n: number) => { try { sessionStorage.setItem(CHAVE, String(n)); } catch { /* sem armazenamento: avisa de novo */ } };

/** O número no item "Início" do menu: quantas regras esperam a pessoa. */
export function SeloRegras() {
  const lista = useRegrasPendentes();
  const total = totalPendente(lista);
  if (!total) return null;
  const texto = `${total} ${total === 1 ? 'regra de negócio espera' : 'regras de negócio esperam'} a sua confirmação`;
  return <span className="nav-selo" aria-label={texto} title={texto}>{total > 99 ? '99+' : total}</span>;
}

/**
 * O aviso flutuante: aparece ao entrar na plataforma e quando chegam regras novas enquanto a pessoa usa. Some ao
 * fechar e só volta se aumentar o número de regras esperando. No Início não aparece: lá o aviso já está na página.
 */
export function AvisoDeRegras() {
  const lista = useRegrasPendentes();
  const rota = usePathname() ?? '';
  const [visivel, setVisivel] = useState(false);
  const total = totalPendente(lista);

  const um = lista && lista.length === 1 ? lista[0] : null;
  const noProcesso = !!um && rota.startsWith(`/app/processos/${um.id}`);
  // No Início e no processo das regras a pessoa já está vendo o aviso na página: conta como avisada.
  const jaVendo = rota.startsWith('/app/inicio') || noProcesso;

  useEffect(() => {
    if (lista === null) return;
    const avisadas = ler();
    if (total > avisadas && total > 0) { if (jaVendo) gravar(total); else setVisivel(true); }
    if (total < avisadas) gravar(total); // diminuiu: a próxima regra nova avisa de novo
    if (!total) setVisivel(false);
  }, [lista, total, jaVendo]);

  if (!visivel || !total || jaVendo) return null;

  const fechar = () => { gravar(total); setVisivel(false); };
  const sugeridas = (lista ?? []).reduce((n, p) => n + p.sugeridas, 0);
  const ajustes = (lista ?? []).reduce((n, p) => n + p.ajustes, 0);
  const partes = [
    sugeridas && `${sugeridas} ${sugeridas === 1 ? 'regra de negócio espera' : 'regras de negócio esperam'} a sua confirmação`,
    ajustes && `${ajustes} ${ajustes === 1 ? 'pedido de ajuste espera' : 'pedidos de ajuste esperam'} você`,
  ].filter(Boolean);
  return (
    <div className="aviso-regras" role="status" aria-live="polite">
      <span className="aviso-regras-icone" aria-hidden="true"><Icone nome="balanca" tamanho={20} /></span>
      <div className="aviso-regras-texto">
        <strong>{partes.join(' e ')}</strong>
        <span>{um ? <>Em <b>{um.nome}</b>.</> : `Em ${lista!.length} processos.`}</span>
      </div>
      <Link className="btn btn-primary" href={um ? `/app/processos/${um.id}#regras` : '/app/inicio'} onClick={fechar}>Revisar</Link>
      <button type="button" className="btn btn-ghost btn-icon" onClick={fechar} aria-label="Fechar o aviso" title="Fechar"><Icone nome="fechar" tamanho={16} /></button>
    </div>
  );
}
