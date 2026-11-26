// Document Picture-in-Picture: janela do INCFlow sempre por cima das outras,
// para controlar a gravação sem sair do sistema que está sendo gravado.
// Chrome/Edge 116+, Firefox 151+. Sem suporte (Safari), os controles ficam na página.
type DocumentPiP = {
  requestWindow(opcoes?: { width?: number; height?: number; disallowReturnToOpener?: boolean }): Promise<Window>;
  window: Window | null;
};

const api = () => (typeof window !== 'undefined' ? (window as unknown as { documentPictureInPicture?: DocumentPiP }).documentPictureInPicture : undefined);

export const suportaPip = () => !!api();

// Tamanho inicial pensado para a prévia da tela ficar legível (16:9 na largura toda).
// A pessoa pode redimensionar: a prévia acompanha o tamanho da janela.
export async function abrirPip(largura = 480, altura = 520): Promise<Window | null> {
  const pip = api();
  if (!pip) return null;
  if (pip.window) return pip.window;
  const janela = await pip.requestWindow({ width: largura, height: altura });
  const doc = janela.document;
  // Copia os estilos do INCFlow para a janela flutuante.
  for (const folha of Array.from(document.styleSheets)) {
    try {
      const estilo = doc.createElement('style');
      estilo.textContent = Array.from(folha.cssRules).map((r) => r.cssText).join('\n');
      doc.head.appendChild(estilo);
    } catch {
      if (folha.href) {
        const link = doc.createElement('link');
        link.rel = 'stylesheet';
        link.href = folha.href;
        doc.head.appendChild(link);
      }
    }
  }
  doc.documentElement.className = document.documentElement.className;
  doc.documentElement.lang = 'pt-BR';
  doc.title = 'INCFlow · Gravação';
  doc.body.className = 'pip-body';
  // Botões marcados com data-voltar-aba (Encerrar, "continuar outro dia") trazem a aba do INCFlow de volta para a
  // frente (decisão 145). O pedido precisa partir de um script da própria janela flutuante, dentro do clique: é a
  // forma prevista no padrão (Chrome e Edge 123+, Firefox 151+). Roda na captura, antes de o clique fechar a janela.
  try {
    const script = doc.createElement('script');
    script.textContent = "document.addEventListener('click',function(e){var a=e.target&&e.target.closest&&e.target.closest('[data-voltar-aba]');if(a&&window.opener){try{window.opener.focus()}catch(_){}}},true);";
    doc.head.appendChild(script);
  } catch { /* sem o script, a página ainda tenta trazer a aba pelo próprio clique */ }
  return janela;
}
