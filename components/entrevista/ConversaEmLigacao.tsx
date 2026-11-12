import Link from 'next/link';
import { Icone } from '@/components/Icone';
import { SeloSituacao } from '@/components/entrevista/SeloSituacao';

// O aviso de quem tenta abrir a entrevista de outra pessoa enquanto ela está na ligação com a Maia (decisão 69):
// na página da conversa e na página da entrevista no Painel da Maia. A página volta sozinha quando a ligação termina.

export function ConversaEmLigacao({ entrevistado, voltar }: { entrevistado: string | null; voltar: { href: string; rotulo: string } }) {
  return (
    <div className="cartao cartao-em-ligacao" role="status">
      <span className="em-ligacao-icone" aria-hidden="true"><Icone nome="microfone" tamanho={26} /></span>
      <SeloSituacao entrevista={{ status: 'em_andamento', falas: 1, em_ligacao: true, entrevistado }} />
      <h3 className="sem-margem">{entrevistado ?? 'A pessoa'} está conversando com a Maia agora</h3>
      <p className="notice">Enquanto a ligação está em andamento, a conversa fica fechada para todo mundo além de {entrevistado ?? 'quem está sendo entrevistado'}, inclusive administradores. Quando a ligação for pausada ou encerrada, a entrevista abre aqui sozinha.</p>
      <div className="fluxo-acoes">
        <Link href={voltar.href} className="btn"><Icone nome="voltar" tamanho={16} />{voltar.rotulo}</Link>
      </div>
    </div>
  );
}
