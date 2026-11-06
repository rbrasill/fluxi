// O lado do navegador da entrevista por voz (decisão 39): microfone → escuta ao vivo da AssemblyAI
// (WebSocket, token temporário) → quando a pessoa termina de falar, o texto vai ao servidor, que devolve
// a próxima fala da IA → a fala vira áudio (voz da AssemblyAI; se faltar, a voz do navegador) → e a
// escuta recomeça. Enquanto a IA fala ou pensa, o microfone manda silêncio: a escuta não ouve a própria
// voz da IA. A conversa inteira (os dois lados) é gravada para ficar guardada no processo.
import { escutaDaEntrevista, responderTurno, vozDaEntrevista } from '@/lib/entrevistas';

export type Fase = 'parado' | 'conectando' | 'falando' | 'ouvindo' | 'pensando' | 'encerrando';
export type Evento =
  | { tipo: 'fase'; fase: Fase }
  | { tipo: 'pergunta'; perguntas: number; cobertos: string[] }
  | { tipo: 'aviso'; texto: string }
  | { tipo: 'fala'; texto: string } // sem voz nenhuma disponível: a pergunta vai para a tela
  | { tipo: 'erro'; texto: string; repetir?: () => void }
  | { tipo: 'fim' }; // a IA se despediu: hora de encerrar e processar

type Mensagem = { type: string; turn_order?: number; end_of_turn?: boolean; turn_is_formatted?: boolean; transcript?: string; error?: string };

const GRACA_MS = 900; // depois do fim de uma fala, espera um pouco: a pessoa pode continuar a frase
const LEMBRETE_MS = 30_000; // ninguém falou: repete a pergunta uma vez
const RECONEXOES = 2;

export class MotorEntrevista {
  private ws: WebSocket | null = null;
  private ctxCaptura: AudioContext | null = null;
  private ctxSom: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private gravador: MediaRecorder | null = null;
  private partes: Blob[] = [];
  private recDest: MediaStreamAudioDestinationNode | null = null;
  private audio: HTMLAudioElement | null = null;
  private urlAudio: string | null = null;
  private silencio: ArrayBuffer | null = null;
  private ouvindo = false;
  private ativo = false;
  private fase: Fase = 'parado';
  private pendentes = new Map<number, string>();
  private enviados = new Set<number>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private lembrete: ReturnType<typeof setTimeout> | null = null;
  private ultimaFala = '';
  private vozPeloNavegador = false;
  private reconexoes = 0;
  private aoSair = () => { try { this.ws?.send(JSON.stringify({ type: 'Terminate' })); } catch { /* sem conexão */ } };

  constructor(private id: string, private aoEvento: (e: Evento) => void, private opcoes: { graciaMs?: number; lembreteMs?: number } = {}) {}

  /** Liga o microfone, a escuta e a voz; `fala` é o que a IA diz primeiro (a abertura ou a última pergunta). */
  async iniciar(fala: string) {
    this.ativo = true;
    this.mudar('conectando');
    // Os contextos de áudio nascem dentro do clique (política de autoplay); o de captura tenta 16 kHz.
    try { this.ctxCaptura = new AudioContext({ sampleRate: 16000 }); } catch { this.ctxCaptura = new AudioContext(); }
    this.ctxSom = new AudioContext();
    this.audio = new Audio();
    this.audio.preload = 'auto';
    const fonteVoz = this.ctxSom.createMediaElementSource(this.audio);
    this.recDest = this.ctxSom.createMediaStreamDestination();
    fonteVoz.connect(this.ctxSom.destination);
    fonteVoz.connect(this.recDest);
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    if (!this.ativo) return;
    await this.ctxCaptura.audioWorklet.addModule('/entrevista/captura.js');
    const captura = new AudioWorkletNode(this.ctxCaptura, 'captura-pcm', { processorOptions: { alvo: 16000 } });
    captura.port.onmessage = (e) => this.enviarAudio(e.data as ArrayBuffer);
    const mic = this.ctxCaptura.createMediaStreamSource(this.stream);
    mic.connect(captura);
    captura.connect(this.ctxCaptura.destination); // o worklet não devolve som; precisa estar ligado para rodar
    this.ctxSom.createMediaStreamSource(this.stream).connect(this.recDest);
    this.gravar();
    await Promise.all([this.ctxCaptura.resume(), this.ctxSom.resume()]);
    window.addEventListener('beforeunload', this.aoSair);
    await this.conectar();
    await this.falar(fala);
  }

  /** Repete a última fala da IA (a pessoa não ouviu). */
  repetir() {
    if (this.fase !== 'ouvindo' || !this.ultimaFala) return;
    this.ouvindo = false;
    void this.falar(this.ultimaFala);
  }

  /** Para tudo e devolve o áudio gravado da conversa (null se não gravou). */
  async encerrar(): Promise<Blob | null> {
    this.ativo = false;
    this.ouvindo = false;
    this.pararTimers();
    this.mudar('encerrando');
    window.removeEventListener('beforeunload', this.aoSair);
    const ws = this.ws;
    this.ws = null;
    if (ws && ws.readyState === WebSocket.OPEN) {
      try { ws.send(JSON.stringify({ type: 'Terminate' })); } catch { /* já caiu */ }
      setTimeout(() => ws.close(), 400);
    } else ws?.close();
    this.audio?.pause();
    if ('speechSynthesis' in window) speechSynthesis.cancel();
    const blob = await this.pararGravacao();
    this.stream?.getTracks().forEach((t) => t.stop());
    await Promise.all([this.ctxCaptura?.close(), this.ctxSom?.close()]).catch(() => {});
    if (this.urlAudio) URL.revokeObjectURL(this.urlAudio);
    this.mudar('parado');
    return blob;
  }

  // --- escuta ---

  private async conectar() {
    const { url, termos } = await escutaDaEntrevista(this.id);
    await new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(url);
      ws.binaryType = 'arraybuffer';
      let aberto = false;
      ws.onmessage = (ev) => {
        if (typeof ev.data !== 'string') return;
        let m: Mensagem;
        try { m = JSON.parse(ev.data); } catch { return; }
        if (m.type === 'Begin') {
          aberto = true;
          // Nomes do processo, da área e dos POPs: a escuta tende a errá-los sem essa ajuda.
          if (termos.length) ws.send(JSON.stringify({ type: 'UpdateConfiguration', keyterms_prompt: termos }));
          resolve();
          return;
        }
        if (m.type === 'Error') { console.warn('escuta:', m.error); return; }
        this.aoMensagem(m);
      };
      ws.onerror = () => { if (!aberto) reject(new Error('Não foi possível ligar a escuta ao vivo.')); };
      ws.onclose = (e) => {
        if (!aberto) reject(new Error(`A escuta recusou a conexão (${e.code}).`));
        else if (this.ws === ws) this.aoCair();
      };
      this.ws = ws;
    });
  }

  private aoCair() {
    this.ws = null;
    if (!this.ativo) return;
    if (this.reconexoes++ >= RECONEXOES) {
      this.aoEvento({ tipo: 'erro', texto: 'A escuta ao vivo caiu. Encerre a entrevista: o que já foi conversado está guardado.' });
      return;
    }
    this.conectar().catch((e) => this.aoEvento({ tipo: 'erro', texto: e instanceof Error ? e.message : 'A escuta caiu.' }));
  }

  private enviarAudio(buf: ArrayBuffer) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    if (this.ouvindo) { this.ws.send(buf); return; }
    if (!this.silencio || this.silencio.byteLength !== buf.byteLength) this.silencio = new ArrayBuffer(buf.byteLength);
    this.ws.send(this.silencio);
  }

  private aoMensagem(m: Mensagem) {
    if (!this.ouvindo) return;
    // A pessoa voltou a falar: a fala anterior ainda não terminou.
    if (m.type === 'SpeechStarted' || (m.type === 'Turn' && !m.end_of_turn)) { this.pararTimer(); this.pararLembrete(); return; }
    if (m.type !== 'Turn' || !m.end_of_turn || m.turn_order === undefined) return;
    if (this.enviados.has(m.turn_order)) return;
    const texto = (m.transcript ?? '').trim();
    if (texto) this.pendentes.set(m.turn_order, texto); // a versão formatada substitui a anterior do mesmo turno
    this.pararTimer();
    this.pararLembrete();
    if (this.pendentes.size) this.timer = setTimeout(() => void this.responder(), this.opcoes.graciaMs ?? GRACA_MS);
  }

  private async responder() {
    const partes = [...this.pendentes.entries()].sort((a, b) => a[0] - b[0]);
    if (!partes.length || !this.ouvindo) return;
    for (const [ordem] of partes) this.enviados.add(ordem);
    this.pendentes.clear();
    await this.enviarTexto(partes.map(([, t]) => t).join(' '));
  }

  private async enviarTexto(texto: string) {
    this.ouvindo = false;
    this.mudar('pensando');
    try {
      const r = await responderTurno(this.id, texto);
      if (!this.ativo) return;
      this.aoEvento({ tipo: 'pergunta', perguntas: r.perguntas, cobertos: r.cobertos });
      await this.falar(r.fala, r.encerrar);
    } catch (e) {
      if (!this.ativo) return;
      this.aoEvento({ tipo: 'erro', texto: `A IA não respondeu (${e instanceof Error ? e.message : e}).`, repetir: () => void this.enviarTexto(texto) });
    }
  }

  // --- voz ---

  private async falar(texto: string, encerrar = false) {
    this.ultimaFala = texto;
    this.mudar('falando');
    try {
      if (this.vozPeloNavegador) await this.vozNavegador(texto);
      else await this.tocar(await vozDaEntrevista(this.id, texto));
    } catch (e) {
      if (!this.ativo) return;
      if (!this.vozPeloNavegador && 'speechSynthesis' in window) {
        this.vozPeloNavegador = true;
        this.aoEvento({ tipo: 'aviso', texto: `Voz da IA indisponível (${e instanceof Error ? e.message : e}); usando a voz do navegador.` });
        await this.vozNavegador(texto);
      } else {
        this.aoEvento({ tipo: 'fala', texto });
      }
    }
    if (!this.ativo) return;
    if (encerrar) { this.aoEvento({ tipo: 'fim' }); return; }
    this.ouvir();
  }

  private tocar(blob: Blob) {
    return new Promise<void>((resolve, reject) => {
      const a = this.audio!;
      if (this.urlAudio) URL.revokeObjectURL(this.urlAudio);
      this.urlAudio = URL.createObjectURL(blob);
      a.onended = () => resolve();
      a.onerror = () => reject(new Error('áudio inválido'));
      a.src = this.urlAudio;
      void this.ctxSom?.resume();
      a.play().catch(reject);
    });
  }

  private vozNavegador(texto: string) {
    return new Promise<void>((resolve) => {
      const u = new SpeechSynthesisUtterance(texto);
      u.lang = 'pt-BR';
      const vozes = speechSynthesis.getVoices();
      const voz = vozes.find((v) => /^pt[-_]BR/i.test(v.lang)) ?? vozes.find((v) => /^pt/i.test(v.lang));
      if (voz) u.voice = voz;
      let pronto = false;
      const fim = () => { if (!pronto) { pronto = true; resolve(); } };
      u.onend = fim;
      u.onerror = fim;
      setTimeout(fim, 2000 + texto.length * 90); // o navegador às vezes não avisa que terminou
      speechSynthesis.cancel();
      speechSynthesis.speak(u);
    });
  }

  private ouvir() {
    this.ouvindo = true;
    this.mudar('ouvindo');
    // A pergunta que acabou de ser feita ajuda a escuta a entender a resposta.
    try { this.ws?.send(JSON.stringify({ type: 'UpdateConfiguration', agent_context: this.ultimaFala.slice(0, 1500) })); } catch { /* sem conexão */ }
    this.pararLembrete();
    this.lembrete = setTimeout(() => { if (this.fase === 'ouvindo' && !this.pendentes.size) this.repetir(); }, this.opcoes.lembreteMs ?? LEMBRETE_MS);
  }

  // --- gravação da conversa ---

  private gravar() {
    if (!this.recDest || typeof MediaRecorder === 'undefined') return;
    for (const mimeType of ['audio/webm;codecs=opus', 'audio/webm', '']) {
      try { this.gravador = mimeType ? new MediaRecorder(this.recDest.stream, { mimeType }) : new MediaRecorder(this.recDest.stream); break; } catch { /* tenta o próximo */ }
    }
    if (!this.gravador) return;
    this.gravador.addEventListener('dataavailable', (e) => { if (e.data.size) this.partes.push(e.data); });
    this.gravador.start(10_000);
  }

  private pararGravacao() {
    return new Promise<Blob | null>((resolve) => {
      const g = this.gravador;
      if (!g || g.state === 'inactive') return resolve(this.partes.length ? new Blob(this.partes, { type: g?.mimeType || 'audio/webm' }) : null);
      g.addEventListener('stop', () => resolve(this.partes.length ? new Blob(this.partes, { type: g.mimeType || 'audio/webm' }) : null), { once: true });
      try { g.stop(); } catch { resolve(null); }
    });
  }

  // --- miudezas ---

  private mudar(fase: Fase) {
    this.fase = fase;
    this.aoEvento({ tipo: 'fase', fase });
  }
  private pararTimer() { if (this.timer) { clearTimeout(this.timer); this.timer = null; } }
  private pararLembrete() { if (this.lembrete) { clearTimeout(this.lembrete); this.lembrete = null; } }
  private pararTimers() { this.pararTimer(); this.pararLembrete(); }
}
