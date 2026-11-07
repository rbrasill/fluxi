// O que a entrevista com a IA precisa descobrir sobre o processo (decisões 39 e 41) e os tipos
// compartilhados entre o navegador e o servidor.
export const TOPICOS = [
  { id: 'objetivo', nome: 'Objetivo', o_que: 'para que o processo existe e o que entrega no fim' },
  { id: 'gatilho', nome: 'Início', o_que: 'o que dispara o processo, quem pede e com que frequência acontece' },
  { id: 'etapas', nome: 'Etapas', o_que: 'a sequência de atividades do início ao fim, na ordem em que acontecem' },
  { id: 'responsaveis', nome: 'Responsáveis', o_que: 'quem faz cada etapa (cargo ou área) e quem aprova' },
  { id: 'ferramentas', nome: 'Ferramentas', o_que: 'sistemas, planilhas, formulários e documentos usados em cada etapa' },
  { id: 'entradas', nome: 'Entradas', o_que: 'o que precisa existir ou chegar para cada etapa acontecer' },
  { id: 'saidas', nome: 'Saídas', o_que: 'o que cada etapa produz e para quem vai' },
  { id: 'regras', nome: 'Regras', o_que: 'prazos, critérios de decisão, alçadas e aprovações' },
  { id: 'excecoes', nome: 'Exceções', o_que: 'o que acontece quando algo sai do padrão e os caminhos alternativos' },
  { id: 'dificuldades', nome: 'Dificuldades', o_que: 'gargalos, retrabalho, esperas e o que costuma dar problema' },
] as const;

/**
 * Um trecho de fala. `inicio_ms`/`fim_ms`: posição na linha do tempo da conversa (desde o começo da
 * primeira sessão de voz). `sobreposta`: a pessoa falou enquanto a IA ainda falava (ou numa pausa curta
 * de uma fala dela). `apoio`: "aham", "sei", "uhum" da IA enquanto a pessoa explica.
 */
export type Turno = { quem: 'ia' | 'pessoa'; texto: string; inicio_ms?: number; fim_ms?: number; sobreposta?: boolean; apoio?: boolean; em?: string };

export type StatusEntrevista = 'em_andamento' | 'processando' | 'concluida' | 'erro';
export const ROTULO_STATUS: Record<StatusEntrevista, string> = { em_andamento: 'Em andamento', processando: 'Gerando o resultado', concluida: 'Concluída', erro: 'Erro ao gerar o resultado' };

/** Medidas da conversa (as da especificação de voz full duplex do Rafael). */
export type Metricas = {
  duracao_s?: number; // tempo de sessão de voz cobrado (soma das sessões)
  reacao_ms?: number[]; // do fim de uma fala da pessoa ao início da fala seguinte da IA
  sobreposicoes?: number; // falas da pessoa feitas enquanto a IA falava
  falas_pessoa?: number;
  falas_ia?: number; // respostas da IA (sem os apoios)
  apoios?: number; // "aham", "sei", "uhum" da IA
  sessoes?: number;
  eventos?: Record<string, number>; // contagem por tipo de evento do GPT-Live (diagnóstico)
  desconhecidos?: string[]; // tipos de evento que o app não trata (diagnóstico)
  erros?: string[];
};

export type Etapa = {
  nome: string;
  responsavel: string;
  descricao: string;
  ferramentas: string[];
  entradas: string[];
  saidas: string[];
  regras: string[];
  excecoes: string[];
};

export type ResultadoEntrevista = {
  descricao: string; // HTML simples (p, ul, ol, li, strong, em)
  ficha: { objetivo: string; gatilho: string; resultado: string; etapas: Etapa[]; dificuldades: string[] };
  pendencias: string[];
};

const mmss = (ms: number) => `${String(Math.floor(ms / 60000)).padStart(2, '0')}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, '0')}`;

/** A conversa em texto (para a análise e para a leitura), com o tempo e a marca de fala sobreposta; sem os apoios da IA. */
export const transcricaoDaConversa = (turnos: Turno[]) =>
  turnos.filter((t) => !t.apoio).map((t) => {
    const tempo = t.inicio_ms !== undefined ? `[${mmss(t.inicio_ms)}] ` : '';
    if (t.quem === 'ia') return `${tempo}Entrevistador: ${t.texto}`;
    return `${tempo}Entrevistado${t.sobreposta ? ' (falou junto com o entrevistador)' : ''}: ${t.texto}`;
  }).join('\n');

const mediana = (xs: number[]) => {
  if (!xs.length) return undefined;
  const o = [...xs].sort((a, b) => a - b);
  return o.length % 2 ? o[(o.length - 1) / 2] : (o[o.length / 2 - 1] + o[o.length / 2]) / 2;
};

/** Resumo das métricas para a tela. Custo: US$ 0,05 por minuto de sessão (gpt-live-1, cobrado por segundo). */
export function resumoMetricas(m: Metricas) {
  const reacoes = m.reacao_ms ?? [];
  return {
    reacao_mediana_ms: mediana(reacoes),
    reacao_media_ms: reacoes.length ? reacoes.reduce((a, b) => a + b, 0) / reacoes.length : undefined,
    sobreposicoes: m.sobreposicoes ?? 0,
    falas_pessoa: m.falas_pessoa ?? 0,
    custo_voz_usd: ((m.duracao_s ?? 0) / 60) * 0.05,
  };
}
