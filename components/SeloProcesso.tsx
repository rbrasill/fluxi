// Selo "Processo" com o ícone do processo: no topo da página, deixa claro que a pessoa está dentro
// de um processo (e não de um POP). O ícone é `public/icones/processo.svg`, sem fundo.

export const ICONE_PROCESSO = '/icones/processo.svg';

export function SeloProcesso() {
  return (
    <span className="selo-processo">
      <img src={ICONE_PROCESSO} alt="" width={20} height={20} />
      Processo
    </span>
  );
}
