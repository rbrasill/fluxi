const caminhos: Record<string, string> = {
  voltar: 'M15 6l-6 6 6 6',
  mais: 'M12 5v14M5 12h14',
  busca: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-3.5-3.5',
  fluxo: 'M5 10a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM10 4h6v5h-6zM10 15h6v5h-6zM7 12h1.5a1.5 1.5 0 0 0 1.5-1.5V6.5M7 12h1.5a1.5 1.5 0 0 1 1.5 1.5v4',
  processos: 'M3 3h7v7H3zM14 14h7v7h-7zM10 6.5h4a2 2 0 0 1 2 2V14',
  pasta: 'M3 6a1 1 0 0 1 1-1h5l2 2h9a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z',
  gravacao: 'M9 3h6v11H9zM5 11a7 7 0 0 0 14 0M12 18v3',
  pop: 'M14 3H6v18h12V7zM14 3v4h4M9 13h6M9 17h4',
  areas: 'M3 21h18M5 21V8l7-4 7 4v13M9 21v-6h6v6',
  baixar: 'M12 4v12M7 11l5 5 5-5M5 20h14',
  expandir: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5',
  ajustar: 'M4 4h6M4 4v6M20 4h-6M20 4v6M4 20h6M4 20v-6M20 20h-6M20 20v-6M9 9h6v6H9z',
  layout: 'M3 3h7v7H3zM14 14h7v7h-7zM10 6.5h4v7.5',
  copiar: 'M9 9h12v12H9zM5 15H3V3h12v2',
  lixo: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
  ia: 'M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8zM19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z',
  camera: 'M4 8h3l2-3h6l2 3h3v11H4zM12 17a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z',
  pausa: 'M8 5v14M16 5v14',
  play: 'M7 4l13 8-13 8z',
  parar: 'M6 6h12v12H6z',
  tela: 'M3 4h18v12H3zM8 20h8M12 16v4',
  salvar: 'M5 3h11l3 3v15H5zM8 3v5h8V3M8 21v-7h8v7',
};

export function Icone({ nome, tamanho = 18 }: { nome: keyof typeof caminhos | string; tamanho?: number }) {
  return (
    <svg width={tamanho} height={tamanho} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={caminhos[nome]} />
    </svg>
  );
}
