// Captura do microfone para a escuta ao vivo da entrevista (decisão 39): converte o som do navegador
// (float, na taxa do dispositivo) em PCM de 16 bits, mono, a 16 kHz, e entrega blocos de 100 ms.
// Roda numa thread de áudio (AudioWorklet); a página manda cada bloco pelo WebSocket.
class CapturaPcm extends AudioWorkletProcessor {
  constructor(opcoes) {
    super();
    this.alvo = (opcoes && opcoes.processorOptions && opcoes.processorOptions.alvo) || 16000;
    this.passo = sampleRate / this.alvo; // quantas amostras de entrada por amostra de saída
    this.pos = 0; // posição (fracionária) na entrada acumulada
    this.resto = new Float32Array(0);
    this.saida = new Int16Array(Math.round(this.alvo / 10)); // 100 ms
    this.n = 0;
  }

  process(entradas) {
    const bloco = entradas[0] && entradas[0][0];
    if (!bloco || !bloco.length) return true;
    const dados = new Float32Array(this.resto.length + bloco.length);
    dados.set(this.resto);
    dados.set(bloco, this.resto.length);
    // Reamostragem por interpolação linear (com passo 1, é cópia direta).
    while (this.pos + 1 < dados.length) {
      const k = Math.floor(this.pos);
      const f = this.pos - k;
      const v = dados[k] + (dados[k + 1] - dados[k]) * f;
      this.saida[this.n++] = Math.max(-1, Math.min(1, v)) * 32767;
      if (this.n === this.saida.length) {
        const copia = this.saida.slice(0).buffer;
        this.port.postMessage(copia, [copia]);
        this.n = 0;
      }
      this.pos += this.passo;
    }
    const k = Math.floor(this.pos);
    this.resto = dados.slice(k);
    this.pos -= k;
    return true;
  }
}

registerProcessor('captura-pcm', CapturaPcm);
