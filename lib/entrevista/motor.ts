// O lado do navegador da entrevista por voz, só com o GPT-Live da OpenAI (decisão 41). O áudio vai e vem
// por WebRTC ao mesmo tempo nos dois sentidos (full duplex): a IA continua ouvindo enquanto fala, e quem
// decide parar, encaixar uma correção ou seguir falando é o próprio modelo. O microfone usa o cancelamento
// de eco do navegador. Pelo canal de dados chegam os pedaços de transcrição dos dois lados (com o tempo de
// cada um); daqui sai a conversa, as métricas (reação, falas sobrepostas, duração) e a gravação.
// Quando a IA quer verificar algo ("deixa eu ver aqui"), o GPT-Live avisa e o app pergunta ao Claude,
// devolvendo a resposta para ela falar (decisão 44).
import { abrirSessaoDeVoz, consultarDuranteEntrevista, pulsoDaLigacao, salvarConversa } from '@/lib/entrevistas';
import { Conversa, metricasDaConversa } from './conversa';
import { LIMITES_ENTREVISTA, type Consulta, type Metricas, type Turno } from './topicos';

export type Fase = 'parado' | 'conectando' | 'falando' | 'ouvindo' | 'juntos' | 'encerrando';
export type Evento =
  | { tipo: 'fase'; fase: Fase }
  | { tipo: 'metricas'; metricas: Metricas; duracao_s: number }
  | { tipo: 'nivel'; ia: number; pessoa: number } // volume de cada lado (0 a 1), várias vezes por segundo, para a esfera
  | { tipo: 'aviso'; texto: string }
  | { tipo: 'erro'; texto: string; repetir?: () => void }
  | { tipo: 'fim' } // a IA se despediu: hora de encerrar e processar
  | { tipo: 'pausa' }; // pausar e continuar depois: desliga a sessão (sem custo) e a entrevista fica aberta

type Mensagem = { type: string; delta?: string; start_ms?: number; end_ms?: number; usage?: { seconds?: number }; error?: { message?: string }; reason?: string; [k: string]: unknown };

/** O microfone como a ligação precisa: mono, com cancelamento de eco (a voz da Maia sai pela caixa de som). */
export const RESTRICOES_MICROFONE: MediaTrackConstraints = { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true };
const SALVAR_MS = 15_000; // guarda a conversa durante a sessão (nada se perde se a página fechar) e avisa que a ligação continua (decisão 69)
const LIMITE_MS = LIMITES_ENTREVISTA.sessao_min * 60_000; // teto de uma sessão (custo): pausa sozinha
const INATIVIDADE_MS = LIMITES_ENTREVISTA.inatividade_min * 60_000; // ninguém falou nesse tempo: pausa sozinha (a sessão parada também é cobrada)
const NIVEL_VOZ = 0.02; // volume (RMS) a partir do qual alguém está falando
const MAX_CONSULTAS = LIMITES_ENTREVISTA.max_consultas; // por sessão (custo)
const CONHECIDOS = new Set(['session.started', 'session.input_transcript.delta', 'session.output_transcript.delta', 'session.usage.updated', 'session.closed', 'session.delegation.created', 'session.thinking.appended', 'session.commentary.appended', 'session.instructions.appended', 'session.updated', 'error']);

/** Sem acento, pontuação nem maiúsculas, para achar a frase da despedida (ou da pausa) na transcrição. */
export const normalizar = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

const somar = (a: Record<string, number> = {}, b: Record<string, number> = {}) => {
  const r = { ...a };
  for (const [k, v] of Object.entries(b)) r[k] = (r[k] ?? 0) + v;
  return r;
};

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
  private consultas: Consulta[] = [];
  private iaFalou = false;
  private conexaoMs: number | undefined; // do clique até a sessão começar
  private conexaoEtapas: NonNullable<Metricas['conexao_etapas']> = {};
  private aberturaMs: number | undefined; // da sessão começar até a IA falar
  private ultimaFala = 0; // performance.now() do último pedaço de transcrição (de qualquer lado)
  private consultando = 0; // consultas em andamento (a espera não conta como inatividade)
  private pausou = false;
  // Os testes de tela encurtam a espera da pausa por inatividade (window.__entrevistaInatividadeMs).
  private inatividadeMs = (globalThis as { __entrevistaInatividadeMs?: number }).__entrevistaInatividadeMs ?? INATIVIDADE_MS;
  private fimPedido = false;
  private alguemFalando = false;
  private timers: ReturnType<typeof setInterval>[] = [];
  private fechada: (() => void) | null = null;
  private ultimoSalvo = '';
  // A página está fechando: desliga a sessão, avisa que a ligação acabou (pedido leve, que sai mesmo com a página
  // indo embora) e guarda o que faltava da conversa.
  private saindo = false;
  private aoSair = () => { this.enviar({ type: 'session.close' }); this.saindo = true; void pulsoDaLigacao(this.id, false).catch(() => {}); void this.salvar(); };

  constructor(private id: string, private aoEvento: (e: Evento) => void, private anteriores: Turno[] = [], private metricasAnteriores: Metricas = {}, private fraseFinal = 'Vamos concluir por aqui', private frasePausa = 'A gente continua depois') {
    // Ao continuar, a sessão nova começa depois do fim da conversa já salva.
    const fim = anteriores.reduce((m, t) => Math.max(m, t.fim_ms ?? t.inicio_ms ?? 0), 0);
    this.conversa = new Conversa(anteriores, anteriores.length ? fim + 2000 : 0);
    this.duracaoAnterior_s = metricasAnteriores.duracao_s ?? 0;
  }

  /** Liga. O microfone pode vir pronto da tela (pedido quando a pessoa marcou a ciência, decisão 55): aí a ligação não espera a permissão. */
  async iniciar(microfone?: MediaStream | null) {
    const clique = performance.now();
    this.ativo = true;
    this.mudar('conectando');
    this.ctx = new AudioContext(); // nasce dentro do clique (política de autoplay)
    const pronto = !!microfone && microfone.getAudioTracks().some((t) => t.readyState === 'live');
    this.stream = pronto ? microfone! : await navigator.mediaDevices.getUserMedia({ audio: RESTRICOES_MICROFONE });
    // Cada etapa da conexão fica medida (para achar onde está a demora: navegador, Vercel ou OpenAI).
    let marca = performance.now();
    const etapa = () => { const agora = performance.now(), ms = Math.round(agora - marca); marca = agora; return ms; };
    this.conexaoEtapas = { microfone_ms: Math.round(marca - clique) };
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
      // Sem conexão, a sessão não serve mais: pausa (desliga tudo; o que foi conversado está guardado).
      if (pc.connectionState === 'failed' && this.ativo) {
        this.registrarErro('A conexão de voz caiu.');
        this.aoEvento({ tipo: 'aviso', texto: 'A ligação com a Maia caiu e a entrevista foi pausada. O que já foi conversado está guardado: clique em Continuar para seguir.' });
        this.aoEvento({ tipo: 'pausa' });
      }
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
      // Os candidatos locais saem em milissegundos; esperar a coleta inteira chegava a 3 s. O servidor da
      // OpenAI tem endereço público e acha o navegador pelas próprias verificações de conexão.
      setTimeout(r, 800);
    });
    this.conexaoEtapas.oferta_ms = etapa();
    const { sdp, openai_ms, complemento } = await abrirSessaoDeVoz(this.id, pc.localDescription!.sdp);
    this.conexaoEtapas.servidor_ms = etapa();
    if (typeof openai_ms === 'number') this.conexaoEtapas.openai_ms = openai_ms;
    if (!this.ativo) return;
    await pc.setRemoteDescription({ type: 'answer', sdp });
    await iniciou;
    this.conexaoEtapas.inicio_ms = etapa();
    this.inicioSessao = performance.now();
    this.ultimaFala = this.inicioSessao;
    this.conexaoMs = Math.round(this.inicioSessao - clique);
    // O GPT-Live não abre a conversa sozinho (nos quatro primeiros testes, só falou depois do pedido):
    // pede a abertura assim que a sessão começa, sem esperar.
    if (!this.iaFalou) this.enviar({ type: 'session.commentary.append', delegation_id: null, content: complemento ? 'A pessoa voltou para completar a entrevista: cumprimente de volta em uma frase, diga que vocês vão fechar os pontos que ficaram em aberto e faça a primeira pergunta da lista.' : this.anteriores.length ? 'A pessoa voltou para continuar a entrevista: diga que bom que ela voltou, lembre em uma frase onde vocês pararam e siga com a próxima pergunta.' : 'Apresente-se e faça a primeira pergunta da entrevista.' });
    this.gravar(gravacao.stream);
    await this.ctx.resume();
    window.addEventListener('beforeunload', this.aoSair);
    window.addEventListener('pagehide', this.aoSair);
    this.timers.push(setInterval(() => this.medir(), 50));
    this.timers.push(setInterval(() => { const metricas = this.metricas(); this.aoEvento({ tipo: 'metricas', metricas, duracao_s: metricas.duracao_s ?? 0 }); }, 1000));
    this.timers.push(setInterval(() => void this.salvar(), SALVAR_MS));
    // Proteções de custo: a sessão nunca fica ligada sem uso. Teto por sessão e pausa por inatividade.
    this.timers.push(setInterval(() => {
      if (!this.ativo || this.fimPedido) return;
      const agora = performance.now();
      if (agora - this.inicioSessao > LIMITE_MS) {
        this.fimPedido = true;
        this.aoEvento({ tipo: 'aviso', texto: `A ligação chegou a ${LIMITES_ENTREVISTA.sessao_min} minutos e foi pausada. O que já foi conversado está guardado: clique em Continuar para seguir.` });
        this.aoEvento({ tipo: 'pausa' });
      } else if (!this.consultando && agora - this.ultimaFala > this.inatividadeMs) { // pela transcrição: ruído de fundo não segura a sessão
        this.fimPedido = true;
        this.aoEvento({ tipo: 'aviso', texto: `Ninguém falou por ${LIMITES_ENTREVISTA.inatividade_min} minutos e a entrevista foi pausada. O que já foi conversado está guardado: clique em Continuar quando quiser.` });
        this.aoEvento({ tipo: 'pausa' });
      }
    }, 5000));
    this.mudar('ouvindo');
  }

  /** Antes de encerrar para continuar depois: a pausa entra nas métricas. */
  marcarPausa() {
    this.pausou = true;
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
    window.removeEventListener('pagehide', this.aoSair);
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
        if (m.delta) {
          this.ultimaFala = performance.now();
          this.conversa.adicionar({ quem: 'pessoa', texto: m.delta, inicio_ms: inicio, fim_ms: fim });
        }
        break;
      case 'session.output_transcript.delta':
        if (m.delta) {
          if (!this.iaFalou) this.aberturaMs = Math.max(0, Math.round(typeof m.start_ms === 'number' ? m.start_ms : agoraMs));
          this.iaFalou = true;
          this.ultimaFala = performance.now();
          this.conversa.adicionar({ quem: 'ia', texto: m.delta, inicio_ms: inicio, fim_ms: fim });
          this.verificarFim();
        }
        break;
      case 'session.usage.updated':
        if (typeof m.usage?.seconds === 'number') this.usoSessao_s = m.usage.seconds; // acumulado: vale o último
        break;
      case 'session.delegation.created':
        // A IA quer verificar algo: o evento não diz o quê, então vai o fim da conversa para o Claude.
        void this.consultar((m.delegation as { id?: string } | undefined)?.id ?? null);
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

  /** Pergunta ao Claude o que a IA quer verificar e entrega a resposta para ela falar (o GPT-Live parafraseia). */
  private async consultar(delegation_id: string | null) {
    const responder = (content: string) => this.enviar({ type: 'session.commentary.append', delegation_id, content });
    if (this.consultas.length >= MAX_CONSULTAS) return responder('Não dá para consultar mais nada nesta conversa. Diga isso em uma frase e siga a entrevista.');
    const inicio = performance.now();
    this.consultando++;
    try {
      const r = await consultarDuranteEntrevista(this.id, this.conversa.turnos().slice(-30));
      this.consultas.push({ pergunta: r.pergunta, resposta: r.resposta, demora_ms: Math.round(performance.now() - inicio), custo_usd: r.custo_usd });
      if (this.ativo) responder(`Resultado da consulta (${r.pergunta}): ${r.resposta}`);
    } catch (e) {
      const texto = e instanceof Error ? e.message : String(e);
      this.consultas.push({ pergunta: '', resposta: texto.slice(0, 300), demora_ms: Math.round(performance.now() - inicio), custo_usd: 0, falhou: true });
      this.registrarErro(`Consulta: ${texto}`);
      if (this.ativo) responder('A consulta não deu certo. Diga em uma frase que não conseguiu verificar agora e siga a entrevista.');
    } finally {
      this.consultando--;
      this.ultimaFala = performance.now();
    }
  }

  /**
   * A IA disse a frase da despedida ("vamos concluir por aqui": encerra) ou da pausa ("a gente continua
   * depois": desliga a sessão e a entrevista fica aberta). Age depois que ela terminar de falar e ninguém mais falar.
   */
  private verificarFim() {
    if (this.fimPedido) return;
    const ultimaIa = [...this.conversa.turnos()].reverse().find((t) => t.quem === 'ia');
    if (!ultimaIa) return;
    const dito = normalizar(ultimaIa.texto);
    const tipo = dito.includes(normalizar(this.fraseFinal)) ? 'fim' : dito.includes(normalizar(this.frasePausa)) ? 'pausa' : null;
    if (!tipo) return;
    this.fimPedido = true;
    let silencio = 0;
    const t = setInterval(() => {
      if (!this.ativo) return clearInterval(t);
      silencio = this.alguemFalando ? 0 : silencio + 250;
      if (silencio >= 2500) { clearInterval(t); this.aoEvento({ tipo }); }
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
      eventos: somar(this.metricasAnteriores.eventos, this.eventos), // de todas as sessões (as sessões fechadas aparecem em session.closed)
      desconhecidos: this.desconhecidos,
      erros: [...(this.metricasAnteriores.erros ?? []), ...this.erros].slice(-30),
      consultas: [...(this.metricasAnteriores.consultas ?? []), ...this.consultas].slice(-30),
      conexao_ms: this.conexaoMs ?? this.metricasAnteriores.conexao_ms,
      conexao_etapas: this.conexaoMs !== undefined ? this.conexaoEtapas : this.metricasAnteriores.conexao_etapas,
      abertura_ms: this.aberturaMs ?? this.metricasAnteriores.abertura_ms,
      pausas: (this.metricasAnteriores.pausas ?? 0) + (this.pausou ? 1 : 0),
    };
  }

  private async salvar(forcar = false) {
    const turnos = this.conversa.turnos();
    const metricas = this.metricas();
    this.aoEvento({ tipo: 'metricas', metricas, duracao_s: metricas.duracao_s ?? 0 });
    const chave = JSON.stringify(turnos);
    if (!forcar && chave === this.ultimoSalvo) {
      // Nada novo para guardar: só o pulso, para a entrevista seguir aparecendo como "em andamento" (decisão 69).
      if (this.ativo && !this.saindo) await pulsoDaLigacao(this.id).catch(() => {});
      return;
    }
    this.ultimoSalvo = chave;
    // Enquanto a ligação está ativa, cada gravação renova o sinal; a última (pausa, fim ou página fechando) apaga.
    await salvarConversa(this.id, { turnos, metricas, em_ligacao: this.ativo && !this.saindo }).catch((e) => console.warn('salvar conversa:', e));
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
