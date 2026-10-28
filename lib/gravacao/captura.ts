// Captura de um print fora da gravação: pela tela (uma janela do sistema), pela área de
// transferência (Ctrl+V depois do Print Screen) ou por arquivo. Tudo vira PNG, como as telas
// marcadas na gravação, para o POP, o DOCX e o PDF tratarem igual.

export type Print = { blob: Blob; largura: number; altura: number };

/** Desenha o quadro atual de uma trilha de vídeo num canvas e devolve em PNG (texto nítido). */
export async function quadroDaTrilha(trilha: MediaStreamTrack, videoDeApoio?: HTMLVideoElement): Promise<Print> {
  let imagem: CanvasImageSource;
  let w: number;
  let h: number;
  const IC = (window as unknown as { ImageCapture?: new (t: MediaStreamTrack) => { grabFrame(): Promise<ImageBitmap> } }).ImageCapture;
  if (IC) {
    const bmp = await new IC(trilha).grabFrame();
    imagem = bmp;
    w = bmp.width;
    h = bmp.height;
  } else {
    if (!videoDeApoio) throw new Error('Este navegador não captura a tela.');
    imagem = videoDeApoio;
    w = videoDeApoio.videoWidth;
    h = videoDeApoio.videoHeight;
  }
  const blob = await paraPng(imagem, w, h);
  if ('close' in imagem && typeof imagem.close === 'function') imagem.close();
  return { blob, largura: w, altura: h };
}

async function paraPng(imagem: CanvasImageSource, w: number, h: number) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d')!.drawImage(imagem, 0, 0, w, h);
  return new Promise<Blob>((ok, erro) => canvas.toBlob((b) => (b ? ok(b) : erro(new Error('Falha ao gerar a imagem'))), 'image/png'));
}

export const suportaCapturaDeTela = () => typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getDisplayMedia;

/**
 * Pede uma janela (ou aba) e captura um único quadro dela. O compartilhamento é encerrado
 * logo em seguida. Deve ser chamado a partir de um clique.
 */
export async function capturarTela(): Promise<Print> {
  const stream = await navigator.mediaDevices.getDisplayMedia({
    video: { width: { ideal: 3840 }, height: { ideal: 2160 }, frameRate: { ideal: 5 } },
    audio: false,
    ...({ displaySurface: 'window', selfBrowserSurface: 'exclude', surfaceSwitching: 'exclude' } as object),
  } as DisplayMediaStreamOptions);
  try {
    const trilha = stream.getVideoTracks()[0];
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.srcObject = new MediaStream([trilha]);
    await video.play().catch(() => {});
    // Espera um quadro de verdade (o primeiro pode vir preto).
    await new Promise<void>((ok) => {
      const v = video as HTMLVideoElement & { requestVideoFrameCallback?: (cb: () => void) => void };
      if (v.requestVideoFrameCallback) v.requestVideoFrameCallback(() => v.requestVideoFrameCallback!(() => ok()));
      else setTimeout(ok, 400);
    });
    return await quadroDaTrilha(trilha, video);
  } finally {
    stream.getTracks().forEach((t) => t.stop());
  }
}

/** Converte uma imagem qualquer (PNG, JPEG, WebP…) em PNG com o tamanho original. */
export async function imagemParaPng(arquivo: Blob): Promise<Print> {
  if (!arquivo.type.startsWith('image/')) throw new Error('O arquivo não é uma imagem.');
  const bmp = await createImageBitmap(arquivo);
  const blob = arquivo.type === 'image/png' ? arquivo : await paraPng(bmp, bmp.width, bmp.height);
  const r = { blob, largura: bmp.width, altura: bmp.height };
  bmp.close();
  return r;
}

/** Lê a imagem copiada (Print Screen, "Copiar imagem"). Deve ser chamado a partir de um clique. */
export async function lerPrintDaAreaDeTransferencia(): Promise<Print> {
  if (!navigator.clipboard?.read) throw new Error('Este navegador não lê imagens da área de transferência. Use Ctrl+V ou escolha o arquivo.');
  const itens = await navigator.clipboard.read();
  for (const item of itens) {
    const tipo = item.types.find((t) => t.startsWith('image/'));
    if (tipo) return imagemParaPng(await item.getType(tipo));
  }
  throw new Error('Não há imagem copiada. Tire o print (Print Screen ou Win+Shift+S) e tente de novo.');
}

/** Imagem de um evento de colar (Ctrl+V), se houver. */
export function imagemColada(e: ClipboardEvent): File | null {
  for (const item of Array.from(e.clipboardData?.items ?? [])) {
    if (item.kind === 'file' && item.type.startsWith('image/')) return item.getAsFile();
  }
  return null;
}
