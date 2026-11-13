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
 * Para que serve a entrevista (decisão 89): 'processo' mapeia o processo (etapas, responsáveis, ferramentas);
 * 'regras' levanta as regras de negócio e de comportamento. Cada finalidade tem a sua condução, a sua análise e
 * o seu convite.
 */
export type Finalidade = 'processo' | 'regras';
export const FINALIDADES: { id: Finalidade; rotulo: string; resumo: string }[] = [
  { id: 'processo', rotulo: 'Mapeamento de processo', resumo: 'Como o processo funciona: etapas, quem faz, sistemas, entradas e saídas.' },
  { id: 'regras', rotulo: 'Regras de negócio', resumo: 'O que vale no processo: condições, limites, prazos, obrigações, proibições e como as pessoas devem agir.' },
];
export const rotuloDaFinalidade = (f: Finalidade | null | undefined) => (f === 'regras' ? 'Regras de negócio' : 'Mapeamento de processo');

/** O que a entrevista de regras de negócio precisa descobrir (decisão 89). */
export const TOPICOS_REGRAS = [
  { id: 'condicoes', nome: 'Condições e critérios', o_que: 'quando pode e quando não pode; o que precisa ser verdade para seguir, aprovar ou recusar' },
  { id: 'termos', nome: 'Termos', o_que: 'o que querem dizer as palavras de que as regras dependem ("estratégico", "urgente", "cliente especial")' },
  { id: 'limites', nome: 'Limites e alçadas', o_que: 'valores, quantidades e percentuais máximos ou mínimos, e quem pode autorizar o quê' },
  { id: 'prazos', nome: 'Prazos', o_que: 'até quando, de quanto em quanto tempo, o que vence e o que acontece quando vence' },
  { id: 'obrigacoes', nome: 'Obrigações', o_que: 'o que é sempre obrigatório fazer, conferir, registrar ou guardar' },
  { id: 'proibicoes', nome: 'Proibições', o_que: 'o que nunca pode ser feito, e por quem' },
  { id: 'calculos', nome: 'Cálculos', o_que: 'como se chega a um valor, a uma nota, a uma classificação ou a uma prioridade' },
  { id: 'excecoes', nome: 'Exceções', o_que: 'quando a regra não vale, quem autoriza a exceção e como fica registrado' },
  { id: 'comportamento', nome: 'Comportamento', o_que: 'como as pessoas devem agir ao executar: postura, comunicação, cuidado, sigilo' },
  { id: 'origem', nome: 'Origem', o_que: 'de onde a regra vem: lei, norma, contrato, política interna ou costume' },
  { id: 'consequencias', nome: 'Consequências', o_que: 'o que acontece quando a regra não é cumprida' },
] as const;

/**
 * Os tipos de regra (decisões 89 e 91): de negócio (o que a empresa exige), de comportamento (como as pessoas devem
 * agir) e definição (o que um termo quer dizer no processo). `reconhecer` e `exemplos` alimentam a ajuda da tela,
 * para quem não sabe a diferença.
 */
export type TipoRegra = 'negocio' | 'comportamento' | 'definicao';
export const TIPOS_REGRA: { id: TipoRegra; sigla: string; rotulo: string; o_que: string; reconhecer: string; exemplos: string[] }[] = [
  {
    id: 'negocio', sigla: 'RN', rotulo: 'Regra de negócio', o_que: 'O que a empresa exige: condições, prazos, limites e cálculos.',
    reconhecer: 'Vale não importa quem executa. Dá para conferir olhando o resultado ou o registro, sem ver a pessoa trabalhando.',
    exemplos: ['Só entra no sorteio o cupom recebido até o fechamento da urna.', 'Acima de R$ 50 mil, só o diretor aprova.', 'O prêmio é retirado em até 60 dias.'],
  },
  {
    id: 'comportamento', sigla: 'RC', rotulo: 'Regra de comportamento', o_que: 'Como as pessoas devem agir ao executar o processo.',
    reconhecer: 'É sobre a conduta de quem faz: postura, comunicação, cuidado, sigilo. Só dá para conferir observando a pessoa.',
    exemplos: ['Só a apresentação anuncia o ganhador no ar.', 'O atendente não discute com o cliente: chama o supervisor.', 'Não se comenta o resultado antes da gravação.'],
  },
  {
    id: 'definicao', sigla: 'DF', rotulo: 'Definição', o_que: 'O que uma palavra quer dizer neste processo.',
    reconhecer: 'Não é algo que se cumpre ou descumpre: é o significado de um termo de que as regras dependem.',
    exemplos: ['Projeto estratégico: projeto novo que muda o que a empresa oferece ou que passa de R$ 100 mil.', 'Cupom válido: cupom físico, preenchido por inteiro e sem rasura.'],
  },
];
const tipoDaRegra = (t: TipoRegra) => TIPOS_REGRA.find((x) => x.id === t) ?? TIPOS_REGRA[0];
export const rotuloDoTipo = (t: TipoRegra) => tipoDaRegra(t).rotulo;
/** O código da regra confirmada: RN-01, RC-02, DF-01. */
export const codigoDaRegra = (tipo: TipoRegra, numero: number | null | undefined) => (numero ? `${tipoDaRegra(tipo).sigla}-${String(numero).padStart(2, '0')}` : '');

/**
 * Um trecho de fala. `inicio_ms`/`fim_ms`: posição na linha do tempo da conversa (desde o começo da
 * primeira sessão de voz). `sobreposta`: a pessoa falou enquanto a IA ainda falava (ou numa pausa curta
 * de uma fala dela). `apoio`: "aham", "sei", "uhum" da IA enquanto a pessoa explica.
 */
export type Turno = { quem: 'ia' | 'pessoa'; texto: string; inicio_ms?: number; fim_ms?: number; sobreposta?: boolean; apoio?: boolean; em?: string };

export type StatusEntrevista = 'convidada' | 'em_andamento' | 'processando' | 'concluida' | 'erro';
export const ROTULO_STATUS: Record<StatusEntrevista, string> = { convidada: 'Convidada', em_andamento: 'Em andamento', processando: 'Gerando o resultado', concluida: 'Concluída', erro: 'Erro ao gerar o resultado' };
/** Até quantas pessoas um convite pode chamar de uma vez (uma entrevista por pessoa; decisão 53). */
export const MAX_CONVITES = 3;
/** Quantas conversas entram de uma vez num fluxograma gerado pela IA (decisão 63). */
export const MAX_CONVERSAS_FLUXO = 5;

/** Medidas da conversa (as da especificação de voz full duplex do Rafael). */
export type Metricas = {
  duracao_s?: number; // tempo de sessão de voz cobrado (soma das sessões)
  reacao_ms?: number[]; // do fim de uma fala da pessoa ao início da resposta seguinte da IA
  sobreposicoes?: number; // falas da pessoa feitas enquanto a IA falava
  falas_pessoa?: number;
  falas_ia?: number; // respostas da IA (sem os apoios)
  apoios?: number; // "aham", "sei", "uhum" da IA
  tempo_pessoa_s?: number; // quanto tempo cada lado passou falando
  tempo_ia_s?: number;
  silencio_max_ms?: number; // maior intervalo sem ninguém falar
  conexao_ms?: number; // do clique em começar até a sessão de voz começar (a última sessão)
  abertura_ms?: number; // da sessão começar até a IA começar a falar (a última sessão)
  // As etapas da conexão (a última sessão): microfone, oferta WebRTC, ida ao servidor (dos quais a OpenAI) e início da sessão
  conexao_etapas?: { microfone_ms?: number; oferta_ms?: number; servidor_ms?: number; openai_ms?: number; inicio_ms?: number };
  apoios_por_sinal?: Record<string, number>; // quantas vezes cada sinal de escuta ("aham", "sei"...), para ver se virou vício
  pausas?: number; // vezes em que a entrevista foi pausada para continuar depois
  // A análise no fim (Claude). Tokens e custo somam todas as vezes em que o resultado foi gerado (completar a
  // entrevista refaz o resultado; decisão 57); `vezes` conta quantas foram; modelo e demora são os da última.
  analise?: { modelo: string; entrada_tokens: number; saida_tokens: number; cache_tokens?: number; custo_usd: number; demora_ms?: number; vezes?: number };
  consultas?: Consulta[]; // o que a IA foi verificar durante a conversa (Claude), com demora e custo
  sessoes?: number;
  // Onde cada sessão de voz começa na linha do tempo da conversa (uma por sessão, na ordem): serve para achar,
  // na gravação daquela sessão, o ponto de uma fala (decisão 89).
  bases_ms?: number[];
  eventos?: Record<string, number>; // contagem por tipo de evento do GPT-Live (diagnóstico)
  desconhecidos?: string[]; // tipos de evento que o app não trata (diagnóstico)
  erros?: string[];
};

/** Voltar para fechar pontos em aberto (decisão 56): os escolhidos, quem escolheu, a partir de que fala a conversa continuou e quando fechou. */
export type Complemento = { pendencias: string[]; escolhidas_em: string; escolhidas_por: string | null; a_partir_do_turno: number; concluido_em?: string | null };

/** Uma consulta da IA durante a conversa ("deixa eu ver aqui"): o Claude responde e ela fala a resposta. */
export type Consulta = { pergunta: string; resposta: string; demora_ms: number; custo_usd: number; falhou?: boolean };

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

/** O que a pessoa entrevistada não soube responder e outra pessoa sabe (decisão 58): a pergunta e quem saberia (área ou cargo). */
export type PendenciaOutraPessoa = { pergunta: string; quem_sabe: string };
/** Quem é a pessoa entrevistada, como ela contou à Maia (decisão 67): a área ou o setor e o que ela faz. */
export type PerfilEntrevistado = { area: string; funcao: string };
/** No máximo quantos pontos em aberto a análise deixa (decisão 66): os que fazem falta para descrever o processo. */
export const MAX_PENDENCIAS = 5;

export type ResultadoEntrevista = {
  entrevistado?: PerfilEntrevistado; // resultados antigos não têm
  descricao: string; // HTML simples (p, ul, ol, li, strong, em)
  ficha: { objetivo: string; gatilho: string; resultado: string; etapas: Etapa[]; dificuldades: string[] };
  pendencias: string[]; // o que a própria pessoa pode responder (dá para voltar à ligação; decisão 56)
  pendencias_outra_pessoa?: PendenciaOutraPessoa[]; // o que precisa de outra pessoa (resultados antigos não têm)
  // Só na entrevista de regras de negócio (decisão 89): quantas regras a Maia sugeriu. A descrição traz o resumo
  // da conversa e a ficha vem vazia; as regras em si ficam na tabela `regras`, à espera de confirmação.
  regras?: { sugeridas: number };
};

const mmss = (ms: number) => `${String(Math.floor(ms / 60000)).padStart(2, '0')}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, '0')}`;

/** A conversa em texto (para a análise e para a leitura), com o tempo e a marca de fala sobreposta; sem os apoios da IA. */
// Marcas de som que o reconhecimento de voz às vezes escreve ("[sigh]", "(cough)"): saem do texto. Risada vira "(risos)".
const MARCAS_DE_SOM = 'sighs?|sighing|suspiros?|coughs?|coughing|tosse|breath(?:es|ing)?|inhales?|exhales?|clears? throat|throat clearing|sniff(?:s|les)?|gasps?|yawns?|bocejo|pause|pausa|silence|silêncio|noise|background noise|ruído|music|música|crosstalk|inaudible|inaudível';
const RE_RISOS = /\s*[[(]\s*(?:laughter|laughing|laughs|laugh|chuckles?|risada|risos?)\b\s*[\])]?/gi;
const RE_MARCAS = new RegExp(`\\s*[[(]\\s*(?:${MARCAS_DE_SOM})\\b\\s*[\\])]`, 'giu');
/** O texto falado sem as marcas de som do reconhecimento de voz (decisão 57). */
export const limparMarcasDeSom = (s: string) =>
  s.replace(RE_RISOS, ' (risos)').replace(RE_MARCAS, ' ').replace(/^\s*\]\s*/, '').replace(/\s+/g, ' ').trim();

export const transcricaoDaConversa = (turnos: Turno[]) =>
  turnos.filter((t) => !t.apoio).map((t) => {
    const tempo = t.inicio_ms !== undefined ? `[${mmss(t.inicio_ms)}] ` : '';
    const texto = limparMarcasDeSom(t.texto);
    if (t.quem === 'ia') return `${tempo}Entrevistador: ${texto}`;
    return `${tempo}Entrevistado${t.sobreposta ? ' (falou junto com o entrevistador)' : ''}: ${texto}`;
  }).join('\n');

/**
 * A conversa com cada fala numerada (o índice dela na conversa), para a análise de regras apontar de que fala
 * saiu cada regra (decisão 89).
 */
export const transcricaoNumerada = (turnos: Turno[]) =>
  turnos.map((t, i) => ({ t, i })).filter(({ t }) => !t.apoio).map(({ t, i }) => {
    const tempo = t.inicio_ms !== undefined ? `[${mmss(t.inicio_ms)}] ` : '';
    const texto = limparMarcasDeSom(t.texto);
    if (t.quem === 'ia') return `${tempo}Entrevistador: ${texto}`;
    return `#${i} ${tempo}Entrevistado${t.sobreposta ? ' (falou junto com o entrevistador)' : ''}: ${texto}`;
  }).join('\n');

const mediana = (xs: number[]) => {
  if (!xs.length) return undefined;
  const o = [...xs].sort((a, b) => a - b);
  return o.length % 2 ? o[(o.length - 1) / 2] : (o[o.length / 2 - 1] + o[o.length / 2]) / 2;
};

export const PRECO_VOZ_USD_MIN = 0.05; // gpt-live-1: US$ 0,05 por minuto de sessão, cobrado por segundo
/** Limites da sessão de voz (custo): teto por sessão, silêncio que pausa sozinho e consultas por sessão. */
export const LIMITES_ENTREVISTA = { sessao_min: 45, inatividade_min: 2, max_consultas: 20 } as const;

/** Resumo das métricas para a tela (indicadores e custos da entrevista). */
export function resumoMetricas(m: Metricas) {
  const reacoes = m.reacao_ms ?? [];
  const tp = m.tempo_pessoa_s ?? 0, ti = m.tempo_ia_s ?? 0;
  const custo_voz_usd = ((m.duracao_s ?? 0) / 60) * PRECO_VOZ_USD_MIN;
  const custo_analise_usd = m.analise?.custo_usd ?? 0;
  const consultas = m.consultas ?? [];
  const custo_consultas_usd = consultas.reduce((a, c) => a + (c.custo_usd || 0), 0);
  const demoras = consultas.filter((c) => !c.falhou).map((c) => c.demora_ms);
  return {
    reacao_mediana_ms: mediana(reacoes),
    reacao_media_ms: reacoes.length ? reacoes.reduce((a, b) => a + b, 0) / reacoes.length : undefined,
    reacao_max_ms: reacoes.length ? Math.max(...reacoes) : undefined,
    sobreposicoes: m.sobreposicoes ?? 0,
    falas_pessoa: m.falas_pessoa ?? 0,
    falas_ia: m.falas_ia ?? 0,
    apoios: m.apoios ?? 0,
    participacao_pessoa: tp + ti > 0 ? tp / (tp + ti) : undefined, // fração do tempo de fala que foi da pessoa
    silencio_max_ms: m.silencio_max_ms,
    custo_voz_usd,
    custo_analise_usd,
    consultas: consultas.length,
    consulta_mediana_ms: mediana(demoras),
    custo_consultas_usd,
    custo_total_usd: custo_voz_usd + custo_analise_usd + custo_consultas_usd,
  };
}
