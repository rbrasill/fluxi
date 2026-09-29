// Document Picture-in-Picture: janela do Fluxi sempre por cima das outras,
// para controlar a gravação sem sair do sistema que está sendo gravado.
// Chrome/Edge 116+, Firefox 151+. Sem suporte (Safari), os controles ficam na página.
type DocumentPiP = {
  requestWindow(opcoes?: { width?: number; height?: number; disallowReturnToOpener?: boolean }): Promise<Window>;
  window: Window | null;
};

const api = () => (typeof window !== 'undefined' ? (window as unknown as { documentPictureInPicture?: DocumentPiP }).documentPictureInPicture : undefined);

export const suportaPip = () => !!api();

export async function abrirPip(largura = 380, altura = 330): Promise<Window | null> {
  const pip = api();
  if (!pip) return null;
  if (pip.window) return pip.window;
  const janela = await pip.requestWindow({ width: largura, height: altura });
  const doc = janela.document;
  // Copia os estilos do Fluxi para a janela flutuante.
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
  doc.title = 'Fluxi · Gravação';
  doc.body.className = 'pip-body';
  return janela;
}
