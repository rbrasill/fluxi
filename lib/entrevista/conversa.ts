// Monta a conversa a partir dos pedaços de transcrição que o GPT-Live manda durante a sessão (decisão 41).
// Cada pedaço tem quem falou, o texto e o tempo (início e fim, em ms na linha do tempo da sessão). Pedaços
// do mesmo lado, próximos no tempo, viram um trecho; os trechos dos dois lados são ordenados pelo início.
// Como a conversa é full duplex, os trechos podem se sobrepor: a fala da pessoa feita enquanto a IA falava
// (ou numa pausa curta de uma fala dela que não era pergunta) fica marcada como sobreposta. Os "aham",
// "sei" e "uhum" da IA são falas de apoio (decisão 42): não cortam a fala da pessoa nem contam como resposta.
// Daqui saem também as métricas de reação e de sobreposição.
import { limparMarcasDeSom } from './topicos';
import type { Metricas, Turno } from './topicos';

export type Pedaco = { quem: 'ia' | 'pessoa'; texto: string; inicio_ms: number; fim_ms: number };
type Trecho = Required<Pick<Turno, 'quem' | 'texto' | 'inicio_ms' | 'fim_ms'>>;

// Pausa máxima dentro de um mesmo trecho. A IA respira cerca de um segundo no meio de frases longas
// ("tem alguma confirmação… ou retorno que ela recebe?"): isso não é uma fala nova.
const JUNTAR_MS = { pessoa: 1500, ia: 1500 };
const APOIO_PALAVRAS = 3;
const APOIO_MS = 1600;
const PAUSA_MS = 1500; // a pessoa entrou numa pausa curta de uma fala da IA que não tinha terminado em pergunta
const VEZ_MS = 600; // silêncio do outro lado a partir do qual a fala dele conta como terminada
const REACAO_EMENDOU_MS = 1000;

/** Marcas da transcrição ("[laugh]") em texto; um "]" solto no começo (resto de uma marca cortada) sai. */
const limparTexto = limparMarcasDeSom; // marcas de som e espaços (decisão 57)

const palavras = (s: string) => (s.match(/[\p{L}\p{N}]+/gu) ?? []).length;
const terminaEmPergunta = (s: string) => /\?\s*$/.test(s.trim());
/** Fala curta ("aham", "sei", "isso"): poucas palavras, pouco tempo e não é pergunta. */
const ehCurta = (t: Trecho) => palavras(t.texto) <= APOIO_PALAVRAS && t.fim_ms - t.inicio_ms <= APOIO_MS && !terminaEmPergunta(t.texto);
// Os sinais de escuta ("aham", "sei", "faz sentido"…). Uma fala curta da IA fora desta lista ("Claro, sem
// problema.", "Até mais!") é resposta, não sinal de escuta.
const SINAIS = new Set(['aham', 'aha', 'ahan', 'uhum', 'uhm', 'hum', 'hm', 'hmm', 'humm', 'mhm', 'sei', 'ta', 'ta bom', 'ta certo', 'certo', 'entendi', 'ok', 'okay', 'isso', 'sim', 'legal', 'ah legal', 'que legal', 'faz sentido', 'nossa', 'olha so', 'que bom', 'interessante', 'ah', 'e', 'e mesmo', 'ah sim', 'ah ta', 'ah entendi', 'aham aham', 'uhum uhum', 'sei sei', 'ta ta']);
/** O sinal de escuta como foi dito, sem pontuação ("Tá bom." → "tá bom"). */
export const sinalDeEscuta = (texto: string) => texto.toLowerCase().replace(/[^\p{L}\p{N} ]+/gu, ' ').replace(/\s+/g, ' ').trim();
const semAcento = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
/** Os sinais de uma fala curta ("Aham. Tá bom." → ["aham", "tá bom"]); vazio se alguma parte não for sinal de escuta. */
const sinaisDaFala = (texto: string) => {
  const partes = texto.split(/[.,!?;…]+/).map(sinalDeEscuta).filter(Boolean);
  return partes.length && partes.every((p) => SINAIS.has(semAcento(p))) ? partes : [];
};
/** Fala de apoio da IA enquanto a pessoa explica. (Da pessoa, uma fala curta é resposta: "isso", "é".) */
export const ehApoio = (t: Trecho) => t.quem === 'ia' && ehCurta(t) && sinaisDaFala(t.texto).length > 0;

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
    // A vez mudou (fecha o trecho) quando o outro lado falou depois deste trecho e já terminou antes deste
    // pedaço, ou quando começou a falar só depois que este trecho parou (pegou a vez na pausa).
    // Um "aham" da IA não muda a vez da pessoa: o trecho dela continua. Já a pessoa falar qualquer coisa
    // na pausa da IA (mesmo curta, que pode ser o começo de uma resposta) faz a próxima fala da IA ser nova.
    // Os pedaços chegam ao vivo: o trecho do outro lado ainda pode estar crescendo, então ele só conta
    // como "terminado" se já está em silêncio há um tempo (VEZ_MS) quando este pedaço chega.
    const j = this.abertos[p.quem === 'ia' ? 'pessoa' : 'ia'];
    const outro = j !== undefined ? this.trechos[j] : undefined;
    const virouAVez = atual && outro && (
      (!ehCurta(outro) && outro.fim_ms > atual.fim_ms && inicio - outro.fim_ms >= VEZ_MS) ||
      (outro.inicio_ms >= atual.fim_ms && (p.quem === 'ia' || !ehCurta(outro)))
    );
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
    const ordenados: Trecho[] = [...this.trechos].map((t) => ({ ...t, texto: limparTexto(t.texto) })).filter((t) => t.texto).sort((a, b) => a.inicio_ms - b.inicio_ms);
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
 * Se a IA emendou antes do fim marcado da fala (até REACAO_EMENDOU_MS antes: o fim da transcrição é
 * aproximado), a reação conta como zero; mais cedo que isso, a IA já estava falando e não é reação.
 */
export function metricasDaConversa(turnos: Turno[]): Pick<Metricas, 'reacao_ms' | 'sobreposicoes' | 'falas_pessoa' | 'falas_ia' | 'apoios' | 'apoios_por_sinal' | 'tempo_pessoa_s' | 'tempo_ia_s' | 'silencio_max_ms'> {
  const reais = turnos.filter((t) => !t.apoio);
  const dur = (t: Turno) => Math.max(0, (t.fim_ms ?? 0) - (t.inicio_ms ?? 0));
  // Maior silêncio: o maior intervalo em que ninguém estava falando.
  let fimOcupado = 0, silencio_max_ms = 0;
  for (const t of [...turnos].sort((a, b) => (a.inicio_ms ?? 0) - (b.inicio_ms ?? 0))) {
    const ini = t.inicio_ms ?? 0;
    if (fimOcupado > 0 && ini > fimOcupado) silencio_max_ms = Math.max(silencio_max_ms, ini - fimOcupado);
    fimOcupado = Math.max(fimOcupado, t.fim_ms ?? ini);
  }
  const reacao_ms: number[] = [];
  for (let i = 0; i < reais.length; i++) {
    const t = reais[i];
    if (t.quem !== 'pessoa' || t.fim_ms === undefined) continue;
    const proximaIa = reais.slice(i + 1).find((x) => x.quem === 'ia');
    const outraPessoa = reais.slice(i + 1).find((x) => x.quem === 'pessoa');
    if (!proximaIa || proximaIa.inicio_ms === undefined) continue;
    if (outraPessoa && (outraPessoa.inicio_ms ?? 0) < proximaIa.inicio_ms) continue; // a pessoa continuou falando
    const r = proximaIa.inicio_ms - t.fim_ms;
    if (r >= -REACAO_EMENDOU_MS && r < 30_000) reacao_ms.push(Math.max(0, Math.round(r)));
  }
  return {
    reacao_ms,
    sobreposicoes: turnos.filter((t) => t.quem === 'pessoa' && t.sobreposta).length,
    falas_pessoa: turnos.filter((t) => t.quem === 'pessoa').length,
    falas_ia: reais.filter((t) => t.quem === 'ia').length,
    apoios: turnos.filter((t) => t.quem === 'ia' && t.apoio).length,
    apoios_por_sinal: turnos.filter((t) => t.quem === 'ia' && t.apoio).flatMap((t) => sinaisDaFala(t.texto)).reduce<Record<string, number>>((a, k) => { a[k] = (a[k] ?? 0) + 1; return a; }, {}),
    tempo_pessoa_s: Math.round(turnos.filter((t) => t.quem === 'pessoa').reduce((a, t) => a + dur(t), 0) / 1000),
    tempo_ia_s: Math.round(reais.filter((t) => t.quem === 'ia').reduce((a, t) => a + dur(t), 0) / 1000),
    silencio_max_ms,
  };
}
