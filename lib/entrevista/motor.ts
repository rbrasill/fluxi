// O lado do navegador da entrevista por voz, só com o GPT-Live da OpenAI (decisão 41). O áudio vai e vem
// por WebRTC ao mesmo tempo nos dois sentidos (full duplex): a IA continua ouvindo enquanto fala, e quem
// decide parar, encaixar uma correção ou seguir falando é o próprio modelo. O microfone usa o cancelamento
// de eco do navegador. Pelo canal de dados chegam os pedaços de transcrição dos dois lados (com o tempo de
// cada um); daqui sai a conversa, as métricas (reação, falas sobrepostas, duração) e a gravação.
import { abrirSessaoDeVoz, salvarConversa } from '@/lib/entrevistas';
import { Conversa, metricasDaConversa } from './conversa';
import type { Metricas, Turno } from './topicos';

export type Fase = 'parado' | 'conectando' | 'falando' | 'ouvindo' | 'juntos' | 'encerrando';
export type Evento =
  | { tipo: 'fase'; fase: Fase }
  | { tipo: 'metricas'; metricas: Metricas; duracao_s: number }
  | { tipo: 'nivel'; ia: number; pessoa: number } // volume de cada lado (0 a 1), várias vezes por segundo, para a esfera
  | { tipo: 'aviso'; texto: string }
  | { tipo: 'erro'; texto: string; repetir?: () => void }
  | { tipo: 'fim' }; // a IA se despediu: hora de encerrar e processar

type Mensagem = { type: string; delta?: string; start_ms?: number; end_ms?: number; usage?: { seconds?: number }; error?: { message?: string }; reason?: string; [k: string]: unknown };

const SALVAR_MS = 15_000; // guarda a conversa durante a sessão (nada se perde se a página fechar)
const LIMITE_MS = 45 * 60_000; // teto de uma sessão (custo): encerra sozinha
const INICIO_SOZINHA_MS = 3_000; // a IA não abriu a conversa sozinha: pede a abertura
const NIVEL_VOZ = 0.02; // volume (RMS) a partir do qual alguém está falando
const CONHECIDOS = new Set(['session.started', 'session.input_transcript.delta', 'session.output_transcript.delta', 'session.usage.updated', 'session.closed', 'session.delegation.created', 'session.thinking.appended', 'session.commentary.appended', 'session.instructions.appended', 'session.updated', 'error']);

export class MotorEntrevista {
  private pc: RTCPeerConnection | null = null;
  private dc: RTCDataChannel | null = null;
  private stream: MediaStream | null = null;
  private ctx: AudioContext | null = null;
  private audio: HTMLAudioElement | null = null;
  private gravador: MediaRecorder | null = null;
  private partes: Blob[] = [];
  private analisadorIa: AnalyserNode | null = null;
  private analisadorPessoa: AnalyserNode | null = null;
  private conversa: Conversa;
  private ativo = false;
  private fase: Fase = 'parado';
  private inicioSessao = 0; // performance.now() do session.started
  private duracaoAnterior_s: number;
  private usoSessao_s = 0;
  private eventos: Record<string, number> = {};
  private desconhecidos: string[] = [];
  private erros: string[] = [];
  private iaFalou = false;
  private fimPedido = false;
  private alguemFalando = false;
  private timers: ReturnType<typeof setInterval>[] = [];
  private fechada: (() => void) | null = null;
  private ultimoSalvo = '';
  private aoSair = () => { this.enviar({ type: 'session.close' }); void this.salvar(); };

  constructor(private id: string, private aoEvento: (e: Evento) => void, private anteriores: Turno[] = [], private metricasAnteriores: Metricas = {}, private fraseFinal = 'Entrevista concluída.') {
    // Ao continuar, a sessão nova começa depois do fim da conversa já salva.
    const fim = anteriores.reduce((m, t) => Math.max(m, t.fim_ms ?? t.inicio_ms ?? 0), 0);
    this.conversa = new Conversa(anteriores, anteriores.length ? fim + 2000 : 0);
    this.duracaoAnterior_s = metricasAnteriores.duracao_s ?? 0;
  }

  async iniciar() {
    this.ativo = true;
    this.mudar('conectando');
    this.ctx = new AudioContext(); // nasce dentro do clique (política de autoplay)
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    if (!this.ativo) return;
    const pc = new RTCPeerConnection();
    this.pc = pc;
    this.stream.getTracks().forEach((t) => pc.addTrack(t, this.stream!));
    // A voz da IA: toca num <audio> e também passa pelo AudioContext para medir o volume e gravar.
    const gravacao = this.ctx.createMediaStreamDestination();
    const mic = this.ctx.createMediaStreamSource(this.stream);
    this.analisadorPessoa = this.ctx.createAnalyser();
    mic.connect(this.analisadorPessoa);
    mic.connect(gravacao);
    pc.ontrack = (e) => {
      const remoto = e.streams[0] ?? new MediaStream([e.track]);
      this.audio = new Audio();
      this.audio.autoplay = true;
      this.audio.srcObject = remoto;
      void this.audio.play().catch(() => {});
      const voz = this.ctx!.createMediaStreamSource(remoto);
      this.analisadorIa = this.ctx!.createAnalyser();
      voz.connect(this.analisadorIa);
      voz.connect(gravacao);
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' && this.ativo) this.aoEvento({ tipo: 'erro', texto: 'A conexão de voz caiu. Encerre a entrevista: o que já foi conversado está guardado.' });
    };
    const dc = pc.createDataChannel('oai-events');
    this.dc = dc;
    const iniciou = new Promise<void>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('a sessão de voz não começou em 20 s')), 20_000);
      dc.onmessage = (ev) => {
        let m: Mensagem;
        try { m = JSON.parse(typeof ev.data === 'string' ? ev.data : ''); } catch { return; }
        if (m.type === 'session.started') { clearTimeout(t); resolve(); }
        this.aoMensagem(m);
      };
    });
    await pc.setLocalDescription(await pc.createOffer());
    await new Promise<void>((r) => {
      if (pc.iceGatheringState === 'complete') return r();
      const fim = () => { if (pc.iceGatheringState === 'complete') r(); };
      pc.addEventListener('icegatheringstatechange', fim);
      setTimeout(r, 3000); // os candidatos que já houver bastam
    });
    const { sdp } = await abrirSessaoDeVoz(this.id, pc.localDescription!.sdp);
    if (!this.ativo) return;
    await pc.setRemoteDescription({ type: 'answer', sdp });
    await iniciou;
    this.inicioSessao = performance.now();
    this.gravar(gravacao.stream);
    await this.ctx.resume();
    window.addEventListener('beforeunload', this.aoSair);
    this.timers.push(setInterval(() => this.medir(), 50));
    this.timers.push(setInterval(() => { const metricas = this.metricas(); this.aoEvento({ tipo: 'metricas', metricas, duracao_s: metricas.duracao_s ?? 0 }); }, 1000));
    this.timers.push(setInterval(() => void this.salvar(), SALVAR_MS));
    this.timers.push(setInterval(() => { if (this.ativo && performance.now() - this.inicioSessao > LIMITE_MS) { this.aoEvento({ tipo: 'aviso', texto: 'A entrevista chegou ao limite de 45 minutos e foi encerrada.' }); this.aoEvento({ tipo: 'fim' }); } }, 5000));
    // Se a IA não abrir a conversa sozinha, pede a abertura.
    setTimeout(() => {
      if (this.ativo && !this.iaFalou) this.enviar({ type: 'session.commentary.append', delegation_id: null, content: this.anteriores.length ? 'Retome a entrevista em uma frase e faça a próxima pergunta.' : 'Apresente-se e faça a primeira pergunta da entrevista.' });
    }, INICIO_SOZINHA_MS);
    this.mudar('ouvindo');
  }

  /** Um erro do lado do navegador (microfone, conexão): fica no diagnóstico da entrevista. */
  registrarErro(texto: string) {
    if (this.erros.length < 30) this.erros.push(texto.slice(0, 500));
  }

  /** Para tudo: fecha a sessão, guarda a conversa e devolve o áudio gravado (null se não gravou). */
  async encerrar(): Promise<Blob | null> {
    if (!this.ativo && this.fase === 'parado') { if (this.erros.length) await this.salvar(true).catch(() => {}); return null; }
    this.ativo = false;
    this.mudar('encerrando');
    this.timers.forEach(clearInterval);
    window.removeEventListener('beforeunload', this.aoSair);
    // Pede o fim da sessão e espera o "session.closed" (com o uso final) por até 2 s.
    const fechou = new Promise<void>((r) => { this.fechada = r; setTimeout(r, 2000); });
    this.enviar({ type: 'session.close' });
    await fechou;
    this.audio?.pause();
    const blob = await this.pararGravacao();
    this.stream?.getTracks().forEach((t) => t.stop());
    this.pc?.close();
    await this.ctx?.close().catch(() => {});
    await this.salvar(true).catch(() => {});
    this.mudar('parado');
    return blob;
  }

  // --- eventos do GPT-Live ---

  private aoMensagem(m: Mensagem) {
    this.eventos[m.type] = (this.eventos[m.type] ?? 0) + 1;
    if (!CONHECIDOS.has(m.type) && this.desconhecidos.length < 30 && !this.desconhecidos.includes(m.type)) this.desconhecidos.push(m.type);
    const agoraMs = this.inicioSessao ? performance.now() - this.inicioSessao : 0;
    const inicio = typeof m.start_ms === 'number' ? m.start_ms : agoraMs;
    const fim = typeof m.end_ms === 'number' ? m.end_ms : inicio;
    switch (m.type) {
      case 'session.input_transcript.delta':
        if (m.delta) this.conversa.adicionar({ quem: 'pessoa', texto: m.delta, inicio_ms: inicio, fim_ms: fim });
        break;
      case 'session.output_transcript.delta':
        if (m.delta) {
          this.iaFalou = true;
          this.conversa.adicionar({ quem: 'ia', texto: m.delta, inicio_ms: inicio, fim_ms: fim });
          this.verificarFim();
        }
        break;
      case 'session.usage.updated':
        if (typeof m.usage?.seconds === 'number') this.usoSessao_s = m.usage.seconds; // acumulado: vale o último
        break;
      case 'session.delegation.created':
        // Não há trabalho de apoio nesta entrevista: avisa o modelo para seguir a conversa.
        this.enviar({ type: 'session.thinking.append', delegation_id: (m.delegation as { id?: string } | undefined)?.id ?? null, content: 'Não há consulta a fazer; continue a entrevista normalmente.' });
        break;
      case 'session.closed':
        this.fechada?.();
        break;
      case 'error': {
        const texto = m.error?.message || JSON.stringify(m).slice(0, 300);
        if (this.erros.length < 30) this.erros.push(texto);
        console.warn('GPT-Live:', texto);
        break;
      }
    }
  }

  /** A IA disse a frase final: depois que ela terminar de falar (e ninguém mais falar), encerra. */
  private verificarFim() {
    if (this.fimPedido) return;
    const ultimaIa = [...this.conversa.turnos()].reverse().find((t) => t.quem === 'ia');
    const alvo = this.fraseFinal.toLowerCase().replace(/[.!]/g, '');
    if (!ultimaIa || !ultimaIa.texto.toLowerCase().replace(/[.!]/g, '').includes(alvo)) return;
    this.fimPedido = true;
    let silencio = 0;
    const t = setInterval(() => {
      if (!this.ativo) return clearInterval(t);
      silencio = this.alguemFalando ? 0 : silencio + 250;
      if (silencio >= 2500) { clearInterval(t); this.aoEvento({ tipo: 'fim' }); }
    }, 250);
  }

  // --- volume: quem está falando agora (só para o sinal na tela) ---

  private nivel(a: AnalyserNode | null) {
    if (!a) return 0;
    const buf = new Float32Array(a.fftSize);
    a.getFloatTimeDomainData(buf);
    let s = 0;
    for (const v of buf) s += v * v;
    return Math.sqrt(s / buf.length);
  }

  private medir() {
    if (!this.ativo) return;
    const nIa = this.nivel(this.analisadorIa);
    const nPessoa = this.nivel(this.analisadorPessoa);
    this.aoEvento({ tipo: 'nivel', ia: Math.min(1, nIa / 0.12), pessoa: Math.min(1, nPessoa / 0.12) });
    const ia = nIa > NIVEL_VOZ;
    const pessoa = nPessoa > NIVEL_VOZ;
    this.alguemFalando = ia || pessoa;
    const fase: Fase = ia && pessoa ? 'juntos' : ia ? 'falando' : 'ouvindo';
    if (fase !== this.fase) this.mudar(fase);
  }

  // --- conversa e métricas ---

  private metricas(): Metricas {
    const turnos = this.conversa.turnos();
    const sessao_s = this.usoSessao_s || (this.inicioSessao ? (performance.now() - this.inicioSessao) / 1000 : 0);
    return {
      ...metricasDaConversa(turnos),
      duracao_s: Math.round(this.duracaoAnterior_s + sessao_s),
      sessoes: (this.metricasAnteriores.sessoes ?? 0) + 1,
      eventos: this.eventos,
      desconhecidos: this.desconhecidos,
      erros: [...(this.metricasAnteriores.erros ?? []), ...this.erros].slice(-30),
    };
  }

  private async salvar(forcar = false) {
    const turnos = this.conversa.turnos();
    const metricas = this.metricas();
    this.aoEvento({ tipo: 'metricas', metricas, duracao_s: metricas.duracao_s ?? 0 });
    const chave = JSON.stringify(turnos);
    if (!forcar && chave === this.ultimoSalvo) return;
    this.ultimoSalvo = chave;
    await salvarConversa(this.id, { turnos, metricas }).catch((e) => console.warn('salvar conversa:', e));
  }

  // --- gravação da conversa (os dois lados) ---

  private gravar(stream: MediaStream) {
    if (typeof MediaRecorder === 'undefined') return;
    for (const mimeType of ['audio/webm;codecs=opus', 'audio/webm', '']) {
      try { this.gravador = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream); break; } catch { /* tenta o próximo */ }
    }
    if (!this.gravador) return;
    this.gravador.addEventListener('dataavailable', (e) => { if (e.data.size) this.partes.push(e.data); });
    this.gravador.start(10_000);
  }

  private pararGravacao() {
    return new Promise<Blob | null>((resolve) => {
      const g = this.gravador;
      const pronto = () => resolve(this.partes.length ? new Blob(this.partes, { type: g?.mimeType || 'audio/webm' }) : null);
      if (!g || g.state === 'inactive') return pronto();
      g.addEventListener('stop', pronto, { once: true });
      try { g.stop(); } catch { resolve(null); }
    });
  }

  // --- miudezas ---

  private enviar(m: Record<string, unknown>) {
    try { if (this.dc?.readyState === 'open') this.dc.send(JSON.stringify(m)); } catch { /* canal fechado */ }
  }
  private mudar(fase: Fase) {
    this.fase = fase;
    this.aoEvento({ tipo: 'fase', fase });
  }
}
