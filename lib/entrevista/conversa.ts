// Monta a conversa a partir dos pedaços de transcrição que o GPT-Live manda durante a sessão (decisão 41).
// Cada pedaço tem quem falou, o texto e o tempo (início e fim, em ms na linha do tempo da sessão). Pedaços
// do mesmo lado, próximos no tempo, viram um trecho; os trechos dos dois lados são ordenados pelo início.
// Como a conversa é full duplex, os trechos podem se sobrepor: a fala da pessoa feita enquanto a IA falava
// (ou numa pausa curta de uma fala dela que não era pergunta) fica marcada como sobreposta. Os "aham",
// "sei" e "uhum" da IA são falas de apoio (decisão 42): não cortam a fala da pessoa nem contam como resposta.
// Daqui saem também as métricas de reação e de sobreposição.
import type { Metricas, Turno } from './topicos';

export type Pedaco = { quem: 'ia' | 'pessoa'; texto: string; inicio_ms: number; fim_ms: number };
type Trecho = Required<Pick<Turno, 'quem' | 'texto' | 'inicio_ms' | 'fim_ms'>>;

const JUNTAR_MS = { pessoa: 1500, ia: 900 }; // pausa máxima dentro de um mesmo trecho
const APOIO_PALAVRAS = 3;
const APOIO_MS = 1600;
const PAUSA_MS = 1500; // a pessoa entrou numa pausa curta de uma fala da IA que não tinha terminado em pergunta

const palavras = (s: string) => (s.match(/[\p{L}\p{N}]+/gu) ?? []).length;
const terminaEmPergunta = (s: string) => /\?\s*$/.test(s.trim());
/** Fala curta ("aham", "sei", "isso"): poucas palavras, pouco tempo e não é pergunta. */
const ehCurta = (t: Trecho) => palavras(t.texto) <= APOIO_PALAVRAS && t.fim_ms - t.inicio_ms <= APOIO_MS && !terminaEmPergunta(t.texto);
/** Fala de apoio da IA enquanto a pessoa explica. (Da pessoa, uma fala curta é resposta: "isso", "é".) */
export const ehApoio = (t: Trecho) => t.quem === 'ia' && ehCurta(t);

export class Conversa {
  private trechos: Trecho[] = [];
  private abertos: Partial<Record<'ia' | 'pessoa', number>> = {}; // índice do trecho aberto de cada lado

  /** `anteriores`: a conversa já salva (ao continuar uma entrevista); `deslocamento_ms` empurra a sessão nova para depois dela. */
  constructor(anteriores: Turno[] = [], private deslocamento_ms = 0) {
    for (const t of anteriores) this.trechos.push({ quem: t.quem, texto: t.texto, inicio_ms: t.inicio_ms ?? 0, fim_ms: t.fim_ms ?? t.inicio_ms ?? 0 });
  }

  adicionar(p: Pedaco) {
    const texto = p.texto;
    if (!texto) return;
    const inicio = p.inicio_ms + this.deslocamento_ms;
    const fim = Math.max(inicio, p.fim_ms + this.deslocamento_ms);
    const i = this.abertos[p.quem];
    const atual = i !== undefined ? this.trechos[i] : undefined;
    // O outro lado falou depois deste trecho e já terminou antes deste pedaço: a vez mudou, então fecha.
    // Uma fala curta do outro lado ("aham") não muda a vez: o trecho continua.
    const j = this.abertos[p.quem === 'ia' ? 'pessoa' : 'ia'];
    const outro = j !== undefined ? this.trechos[j] : undefined;
    const virouAVez = atual && outro && !ehCurta(outro) && outro.fim_ms > atual.fim_ms && inicio >= outro.fim_ms;
    if (atual && !virouAVez && inicio - atual.fim_ms <= JUNTAR_MS[p.quem]) {
      atual.texto += texto;
      atual.fim_ms = Math.max(atual.fim_ms, fim);
      return;
    }
    this.trechos.push({ quem: p.quem, texto: texto.trimStart(), inicio_ms: inicio, fim_ms: fim });
    this.abertos[p.quem] = this.trechos.length - 1;
  }

  /** Fim da conversa na linha do tempo (para continuar depois a partir daqui). */
  get fim_ms() {
    return this.trechos.reduce((m, t) => Math.max(m, t.fim_ms), 0);
  }

  turnos(): Turno[] {
    const ordenados: Trecho[] = [...this.trechos].map((t) => ({ ...t, texto: t.texto.replace(/\s+/g, ' ').trim() })).filter((t) => t.texto).sort((a, b) => a.inicio_ms - b.inicio_ms);
    const falasIa = ordenados.filter((t) => t.quem === 'ia' && !ehApoio(t));
    return ordenados.map((t) => {
      if (t.quem === 'ia') return { quem: 'ia', texto: t.texto, inicio_ms: t.inicio_ms, fim_ms: t.fim_ms, ...(ehApoio(t) ? { apoio: true } : {}) };
      // Sobreposta: começou enquanto a IA falava (folga de 200 ms para o fim), ou numa pausa curta de uma
      // fala da IA que não tinha terminado em pergunta (a IA ia continuar; a pessoa entrou no meio).
      const dentro = falasIa.some((ia) => t.inicio_ms > ia.inicio_ms && t.inicio_ms < ia.fim_ms - 200);
      const anterior = [...falasIa].reverse().find((ia) => ia.inicio_ms < t.inicio_ms);
      const naPausa = !!anterior && t.inicio_ms - anterior.fim_ms <= PAUSA_MS && !terminaEmPergunta(anterior.texto);
      return { quem: 'pessoa', texto: t.texto, inicio_ms: t.inicio_ms, fim_ms: t.fim_ms, ...(dentro || naPausa ? { sobreposta: true } : {}) };
    });
  }
}

/**
 * Reação: do fim de cada fala da pessoa ao início da resposta seguinte da IA (os "aham" não contam, e só
 * quando a pessoa não continuou falando antes). Falas da IA: só as respostas; os apoios ficam à parte.
 */
export function metricasDaConversa(turnos: Turno[]): Pick<Metricas, 'reacao_ms' | 'sobreposicoes' | 'falas_pessoa' | 'falas_ia' | 'apoios'> {
  const reais = turnos.filter((t) => !t.apoio);
  const reacao_ms: number[] = [];
  for (let i = 0; i < reais.length; i++) {
    const t = reais[i];
    if (t.quem !== 'pessoa' || t.fim_ms === undefined) continue;
    const proximaIa = reais.slice(i + 1).find((x) => x.quem === 'ia');
    const outraPessoa = reais.slice(i + 1).find((x) => x.quem === 'pessoa');
    if (!proximaIa || proximaIa.inicio_ms === undefined) continue;
    if (outraPessoa && (outraPessoa.inicio_ms ?? 0) < proximaIa.inicio_ms) continue; // a pessoa continuou falando
    const r = proximaIa.inicio_ms - t.fim_ms;
    if (r >= 0 && r < 30_000) reacao_ms.push(Math.round(r));
  }
  return {
    reacao_ms,
    sobreposicoes: turnos.filter((t) => t.quem === 'pessoa' && t.sobreposta).length,
    falas_pessoa: turnos.filter((t) => t.quem === 'pessoa').length,
    falas_ia: reais.filter((t) => t.quem === 'ia').length,
    apoios: turnos.filter((t) => t.quem === 'ia' && t.apoio).length,
  };
}
