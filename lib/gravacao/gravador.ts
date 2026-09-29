// Gravação de tela no navegador: tela (getDisplayMedia) + narração (microfone),
// dividida em segmentos independentes, com captura de quadros para o POP.
import fixWebmDuration from 'fix-webm-duration';
import { LIMITE_ARQUIVO_BYTES, QUALIDADE, SEGMENTO_MS, formatoSuportado } from './config';

export type Estado = 'parado' | 'gravando' | 'pausado' | 'encerrado';

export type Segmento = { indice: number; blob: Blob; inicioMs: number; duracaoMs: number; mime: string };
export type Quadro = { blob: Blob; largura: number; altura: number; tempoMs: number };

type Opcoes = { microfone: boolean; audioDoSistema: boolean };

type Eventos = {
  aoSegmento: (s: Segmento) => void;
  aoEncerrar: () => void; // disparado também quando a pessoa para o compartilhamento pela barra do navegador
};

export class Gravador {
  estado: Estado = 'parado';
  mime = formatoSuportado();
  largura = 0;
  altura = 0;
  temMicrofone = false;
  /** 'monitor' (tela inteira), 'window' (janela) ou 'browser' (aba). */
  superficie = '';

  private tela?: MediaStream;
  private mic?: MediaStream;
  private audio?: AudioContext;
  private stream?: MediaStream;
  private recorder?: MediaRecorder;
  private pedacos: Blob[] = [];
  private bytesSegmento = 0;
  private janelaRelogio: Window = typeof window !== 'undefined' ? window : (undefined as unknown as Window);
  private indice = 0;
  private inicioSegmento = 0;
  private acumulado = 0;
  private retomadoEm = 0;
  private relogio?: number;
  private video?: HTMLVideoElement;
  private finalizando?: Promise<void>;
  private pendentes = new Set<Promise<void>>();

  constructor(private eventos: Eventos) {}

  static suportado() {
    return typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getDisplayMedia && !!formatoSuportado();
  }

  /** Pede a tela e o microfone. Deve ser chamado a partir de um clique. */
  async preparar(op: Opcoes) {
    const tela = await navigator.mediaDevices.getDisplayMedia({
      video: {
        width: { ideal: QUALIDADE.largura, max: QUALIDADE.largura },
        height: { ideal: QUALIDADE.altura, max: QUALIDADE.altura },
        frameRate: { ideal: QUALIDADE.quadrosPorSegundo, max: 30 },
      },
      audio: op.audioDoSistema,
      // Não oferecer a própria aba do Fluxi; permitir trocar de aba durante a gravação.
      // Abre o seletor na aba "Janela": gravando uma janela, a janelinha de controles não aparece nos prints.
      ...({ displaySurface: 'window', selfBrowserSurface: 'exclude', surfaceSwitching: 'include', systemAudio: op.audioDoSistema ? 'include' : 'exclude' } as object),
    } as DisplayMediaStreamOptions);
    this.tela = tela;
    const trilha = tela.getVideoTracks()[0];
    trilha.contentHint = 'detail'; // prioriza nitidez do texto sobre fluidez
    trilha.addEventListener('ended', () => void this.encerrar());
    const conf = trilha.getSettings();
    this.superficie = (conf as { displaySurface?: string }).displaySurface ?? '';
    this.largura = conf.width ?? 0;
    this.altura = conf.height ?? 0;

    if (op.microfone) {
      try {
        this.mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      } catch {
        this.mic = undefined; // segue sem narração se a pessoa negar o microfone
      }
    }
    this.temMicrofone = !!this.mic;

    const fontes = [...tela.getAudioTracks(), ...(this.mic?.getAudioTracks() ?? [])];
    let audio: MediaStreamTrack[] = [];
    if (fontes.length === 1) audio = fontes;
    else if (fontes.length > 1) {
      // Mistura o áudio da tela com a narração numa única trilha.
      this.audio = new AudioContext();
      const destino = this.audio.createMediaStreamDestination();
      for (const f of fontes) this.audio.createMediaStreamSource(new MediaStream([f])).connect(destino);
      audio = destino.stream.getAudioTracks();
    }
    this.stream = new MediaStream([trilha, ...audio]);

    // Vídeo de apoio para capturar quadros onde ImageCapture não existe.
    this.video = document.createElement('video');
    this.video.muted = true;
    this.video.playsInline = true;
    this.video.srcObject = new MediaStream([trilha]);
    await this.video.play().catch(() => {});
  }

  /** Stream da tela, para mostrar a prévia (ex.: na janela flutuante). */
  get previa() {
    return this.tela ? new MediaStream(this.tela.getVideoTracks()) : undefined;
  }

  iniciar() {
    if (!this.stream) throw new Error('Chame preparar() antes.');
    this.estado = 'gravando';
    this.acumulado = 0;
    this.retomadoEm = performance.now();
    this.novoSegmento();
    this.relogio = this.janelaRelogio.setInterval(() => this.verificarSegmento(), 500);
  }

  /**
   * Usa os timers de outra janela (a flutuante, que fica visível). Abas em segundo
   * plano têm os timers atrasados pelo navegador, o que atrasaria a troca de segmento.
   */
  usarRelogioDe(janela: Window) {
    if (this.relogio !== undefined) {
      this.janelaRelogio.clearInterval(this.relogio);
      this.relogio = janela.setInterval(() => this.verificarSegmento(), 500);
    }
    this.janelaRelogio = janela;
  }

  /** Tempo gravado, sem contar as pausas. */
  tempoMs() {
    return Math.round(this.acumulado + (this.estado === 'gravando' ? performance.now() - this.retomadoEm : 0));
  }

  pausar() {
    if (this.estado !== 'gravando') return;
    this.acumulado += performance.now() - this.retomadoEm;
    this.recorder?.pause();
    this.estado = 'pausado';
  }

  retomar() {
    if (this.estado !== 'pausado') return;
    this.retomadoEm = performance.now();
    this.recorder?.resume();
    this.estado = 'gravando';
  }

  /** Captura a tela atual em PNG (texto nítido para o POP). */
  async capturarQuadro(): Promise<Quadro> {
    const tempoMs = this.tempoMs();
    const trilha = this.tela?.getVideoTracks()[0];
    if (!trilha || trilha.readyState !== 'live') throw new Error('A tela não está sendo compartilhada.');
    let imagem: CanvasImageSource & { width?: number; height?: number };
    let w: number;
    let h: number;
    const IC = (window as unknown as { ImageCapture?: new (t: MediaStreamTrack) => { grabFrame(): Promise<ImageBitmap> } }).ImageCapture;
    if (IC) {
      const bmp = await new IC(trilha).grabFrame();
      imagem = bmp;
      w = bmp.width;
      h = bmp.height;
    } else {
      const v = this.video!;
      imagem = v;
      w = v.videoWidth;
      h = v.videoHeight;
    }
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    canvas.getContext('2d')!.drawImage(imagem, 0, 0, w, h);
    if ('close' in imagem && typeof imagem.close === 'function') imagem.close();
    const blob = await new Promise<Blob>((ok, erro) => canvas.toBlob((b) => (b ? ok(b) : erro(new Error('Falha ao capturar a tela'))), 'image/png'));
    return { blob, largura: w, altura: h, tempoMs };
  }

  encerrar(): Promise<void> {
    if (this.finalizando) return this.finalizando;
    this.finalizando = (async () => {
      if (this.estado === 'gravando') this.acumulado += performance.now() - this.retomadoEm;
      this.estado = 'encerrado';
      this.janelaRelogio.clearInterval(this.relogio);
      this.relogio = undefined;
      await this.fecharSegmento();
      await Promise.all(this.pendentes);
      for (const s of [this.tela, this.mic]) s?.getTracks().forEach((t) => t.stop());
      await this.audio?.close().catch(() => {});
      this.video?.pause();
      this.eventos.aoEncerrar();
    })();
    return this.finalizando;
  }

  private novoSegmento() {
    this.pedacos = [];
    this.bytesSegmento = 0;
    this.inicioSegmento = this.tempoMs();
    const r = new MediaRecorder(this.stream!, {
      mimeType: this.mime,
      videoBitsPerSecond: QUALIDADE.videoBps,
      audioBitsPerSecond: QUALIDADE.audioBps,
    });
    r.ondataavailable = (e) => {
      if (!e.data.size) return;
      this.pedacos.push(e.data);
      this.bytesSegmento += e.data.size;
    };
    r.start(1000);
    if (this.estado === 'pausado') r.pause();
    this.recorder = r;
  }

  private verificarSegmento() {
    const porTempo = this.tempoMs() - this.inicioSegmento >= SEGMENTO_MS;
    // Garantia extra: fecha antes se o arquivo se aproximar do limite de 50 MB.
    const porTamanho = this.bytesSegmento >= LIMITE_ARQUIVO_BYTES * 0.85;
    if (this.estado === 'gravando' && (porTempo || porTamanho)) {
      const fim = this.fecharSegmento();
      this.novoSegmento();
      this.pendentes.add(fim);
      fim.finally(() => this.pendentes.delete(fim));
    }
  }

  /** Para o recorder atual e entrega o segmento pronto (com duração gravada no arquivo). */
  private fecharSegmento(): Promise<void> {
    const r = this.recorder;
    if (!r || r.state === 'inactive') return Promise.resolve();
    const pedacos = this.pedacos;
    const indice = this.indice++;
    const inicioMs = this.inicioSegmento;
    const duracaoMs = Math.max(0, this.tempoMs() - inicioMs);
    return new Promise<void>((ok) => {
      r.onstop = async () => {
        let blob = new Blob(pedacos, { type: this.mime.split(';')[0] });
        // MediaRecorder gera WebM sem duração: sem ela o player não consegue avançar/voltar.
        if (this.mime.startsWith('video/webm')) blob = await fixWebmDuration(blob, duracaoMs, { logger: false });
        if (blob.size) this.eventos.aoSegmento({ indice, blob, inicioMs, duracaoMs, mime: this.mime.split(';')[0] });
        ok();
      };
      r.stop();
    });
  }
}
