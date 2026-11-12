import Link from 'next/link';
import { Icone } from '@/components/Icone';
import { corDoAvatar } from '@/lib/iniciais';

// Cartão da área (decisão 88): cartão simples, sem forma de pasta (a pasta é só dos processos).
// Usado na lista de Áreas e na página da organização.
export function CartaoArea({ id, nome, totalProcessos }: { id: string; nome: string; totalProcessos: number }) {
  return (
    <Link href={`/app/areas/${id}`} className="cartao-area" title={nome}>
      <span className={`cartao-area-icone avatar-${corDoAvatar(id)}`} aria-hidden="true"><Icone nome="areas" tamanho={20} /></span>
      <strong>{nome}</strong>
      <span className="cartao-area-conta">{totalProcessos} {totalProcessos === 1 ? 'processo' : 'processos'}</span>
    </Link>
  );
}
