import Image from 'next/image';

// Topo das páginas públicas (decisão 32): a marca e onde o conteúdo está na empresa, sem o menu do app.
export function CabecalhoPublico({ onde }: { onde?: { organizacao: string | null; area: string | null; processo: string | null } }) {
  const caminho = onde ? [onde.organizacao, onde.area, onde.processo].filter(Boolean) : [];
  return (
    <header className="pub-topo">
      <Image src="/logo-fluxi.png" alt="Fluxi" width={126} height={32} className="pub-logo" priority />
      {caminho.length > 0 && <span className="pub-caminho">{caminho.join(' › ')}</span>}
    </header>
  );
}

/** Página pública que não abriu (link desativado, POP fora do ar, processo arquivado ou erro de conexão). */
export function Indisponivel({ titulo, mensagem }: { titulo: string; mensagem: string }) {
  return (
    <div className="pub">
      <CabecalhoPublico />
      <main className="pub-corpo">
        <div className="empty">
          <h2>{titulo}</h2>
          <p>{mensagem}</p>
        </div>
      </main>
    </div>
  );
}
