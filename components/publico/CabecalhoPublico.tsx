import Image from 'next/image';
import { VoltarPara } from '@/components/publico/Referencias';

// Topo das páginas públicas (decisão 32): a marca e onde o conteúdo está na empresa, sem o menu do app.
// Com `processoHref`, o nome do processo leva à página pública dele (decisão 35).
export function CabecalhoPublico({ onde, processoHref }: { onde?: { organizacao: string | null; area: string | null; processo: string | null }; processoHref?: string | null }) {
  const antes = onde ? [onde.organizacao, onde.area].filter(Boolean) : [];
  const processo = onde?.processo ?? null;
  return (
    <header className="pub-topo">
      <Image src="/logo-incflow.png" alt="INCFlow" width={199} height={32} className="pub-logo" priority />
      {(antes.length > 0 || processo) && (
        <span className="pub-caminho">
          {antes.join(' › ')}
          {processo && <>{antes.length ? ' › ' : ''}{processoHref ? <a href={processoHref} title="Abrir a página pública do processo">{processo}</a> : processo}</>}
        </span>
      )}
    </header>
  );
}

/** Página pública que não abriu (link desativado, POP fora do ar, processo arquivado ou erro de conexão). `voltar` é o ?de= de quem chegou por uma referência. */
export function Indisponivel({ titulo, mensagem, voltar = null }: { titulo: string; mensagem: string; voltar?: string | null }) {
  return (
    <div className="pub">
      <CabecalhoPublico />
      <main className="pub-corpo">
        <VoltarPara de={voltar} />
        <div className="empty">
          <h2>{titulo}</h2>
          <p>{mensagem}</p>
        </div>
      </main>
    </div>
  );
}
