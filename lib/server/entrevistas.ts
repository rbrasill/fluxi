import 'server-only';
import { z } from 'zod';
import { TOPICOS, transcricaoDaConversa, type Metricas, type ResultadoEntrevista, type StatusEntrevista, type Turno } from '@/lib/entrevista/topicos';
import { lerTexto, paraHtml, textoPuro } from '@/lib/pop/texto-rico';
import { ErroApi } from './http';
import { chamarEstruturado, type UsoIa } from './ia';
import { TENANT_PADRAO, supabase } from './supabase';

// Entrevista por voz com a IA, só com o GPT-Live da OpenAI (decisão 41), fora do processo, para testar.
// O navegador fala direto com o GPT-Live por WebRTC (áudio nos dois sentidos ao mesmo tempo: full duplex);
// o servidor só abre a sessão (com a chave da OpenAI, que não vai para o navegador) e guarda o que volta:
// a conversa transcrita, as métricas e a gravação. A condução da entrevista está nas instruções da sessão.
// Quando a conversa termina, o Claude lê a conversa inteira e escreve a descrição, a ficha e as pendências.

const BUCKET = 'gravacoes';
const MODELO_VOZ = process.env.INCFLOW_MODELO_VOZ || 'gpt-live-1'; // US$ 0,05 por minuto de sessão
const VOZ = process.env.INCFLOW_VOZ_ENTREVISTA || 'bossa'; // vozes em português do Brasil: bossa e tempo
const MODELO_ANALISE = process.env.INCFLOW_MODELO_ANALISE || 'claude-sonnet-5-5';
const URL_SESSOES = process.env.INCFLOW_LIVE_URL || 'https://api.openai.com/v1/live/sessions';
export const FRASE_FINAL = 'Entrevista concluída.';

export type Linha = {
  id: string; processo_id: string | null; tema: string; contexto: string; motor: string; status: StatusEntrevista;
  turnos: Turno[]; sessoes: string[]; metricas: Metricas;
  resultado: ResultadoEntrevista | null; erro: string | null; audio_caminho: string | null;
  criado_em: string; encerrado_em: string | null; atualizado_em: string;
};
const CAMPOS = 'id, processo_id, tema, contexto, motor, status, turnos, sessoes, metricas, resultado, erro, audio_caminho, criado_em, encerrado_em, atualizado_em';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const agora = () => new Date().toISOString();

async function carregar(id: string): Promise<Linha> {
  if (!UUID.test(id)) throw new ErroApi(404, 'Entrevista não encontrada');
  const { data, error } = await supabase().from('entrevistas').select(CAMPOS).eq('tenant_id', TENANT_PADRAO).eq('id', id).maybeSingle();
  if (error) throw error;
  if (!data) throw new ErroApi(404, 'Entrevista não encontrada');
  return data as Linha;
}

async function salvar(id: string, dados: Partial<Linha>) {
  const { error } = await supabase().from('entrevistas').update({ ...dados, atualizado_em: agora() }).eq('tenant_id', TENANT_PADRAO).eq('id', id);
  if (error) throw error;
}

// --- Criar e listar ---

export async function criar(d: { tema: string; contexto?: string }) {
  const { data, error } = await supabase().from('entrevistas')
    .insert({ tenant_id: TENANT_PADRAO, processo_id: null, tema: d.tema.trim(), contexto: (d.contexto ?? '').trim(), motor: 'gpt-live', status: 'em_andamento', turnos: [], cobertos: [], anotacoes: [], sessoes: [], metricas: {} })
    .select('id').single();
  if (error) throw error;
  return { id: (data as { id: string }).id };
}

export async function listar() {
  const { data, error } = await supabase().from('entrevistas').select('id, tema, status, turnos, metricas, criado_em, encerrado_em')
    .eq('tenant_id', TENANT_PADRAO).order('criado_em', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(({ turnos, metricas, ...e }) => {
    const t = (turnos as Turno[] | null) ?? [];
    const m = (metricas as Metricas | null) ?? {};
    return { ...e, falas: t.length, duracao_s: m.duracao_s ?? 0, custo_analise_usd: m.analise?.custo_usd ?? 0 };
  });
}

export async function obter(id: string) {
  const linha = await carregar(id);
  // Uma gravação por sessão de voz (quem continua a entrevista grava um arquivo novo).
  const arquivos = await gravacoes(id);
  let audios: string[] = [];
  if (arquivos.length) {
    const { data } = await supabase().storage.from(BUCKET).createSignedUrls(arquivos, 60 * 60);
    audios = (data ?? []).map((x) => x.signedUrl).filter((u): u is string => !!u);
  }
  return { ...linha, audios, frase_final: FRASE_FINAL };
}

export async function excluir(id: string) {
  await carregar(id);
  const arquivos = await gravacoes(id);
  if (arquivos.length) await supabase().storage.from(BUCKET).remove(arquivos);
  const { error } = await supabase().from('entrevistas').delete().eq('tenant_id', TENANT_PADRAO).eq('id', id);
  if (error) throw error;
}

// --- A sessão de voz (GPT-Live) ---

const TOPICOS_TEXTO = TOPICOS.map((t) => `- ${t.nome}: ${t.o_que}`).join('\n');

/** As instruções da sessão: o papel de entrevistador, o tema e o jeito de conduzir uma conversa por voz. */
export function instrucoesDaSessao(l: Pick<Linha, 'tema' | 'contexto'>, continuando: boolean) {
  // Segue o esqueleto do guia de prompt do GPT-Live: papel, jeito de falar e as três políticas com os
  // rótulos originais (Backchannel policy, Interruption policy, Delegation policy), que o modelo reconhece.
  return `# Papel
Você é uma consultora de mapeamento de processos fazendo uma entrevista por voz, ao vivo, com uma pessoa que executa ou conhece bem um processo de trabalho. Você trabalha para o INCFlow, a plataforma de processos da INC. Fale sempre em português do Brasil, com naturalidade, tratando a pessoa por "você".

# Jeito de falar
- Ritmo de conversa: frases completas e fluidas, com pausas só entre frases, nunca longas no meio de uma frase. Sem muletas ("eh", "é...", "né") e sem repetir palavras.
- Curto e direto: uma ideia por vez, uma pergunta por vez. Números pequenos por extenso. Nada de listas faladas.
- Assim que a pessoa terminar a frase, responda sem demora. Se ela pausar para pensar e continuar, você só ouve. Nunca fique só no "aham" esperando: terminou, a vez é sua.
- Quando couber, reaja em poucas palavras ("Entendi.", "Faz sentido.") e emende a próxima pergunta.

Backchannel policy: Use sons curtos de escuta ("aham", "uhum", "sei") com moderação enquanto a pessoa explica, sem competir com a fala dela. Um som de escuta nunca substitui uma resposta.

Interruption policy: Quando a pessoa começar a falar por cima de você, pare de falar imediatamente, mesmo no meio da frase, e ouça até ela terminar; depois responda ao que ela disse. Se ela pedir para parar ou esperar, corrigir algo, fazer uma pergunta ou pedir para encerrar, pare na hora, sem terminar a frase e sem acrescentar nada. Não retome o que foi cortado, a não ser que ela peça. Só um "aham", "uhum", "sei" ou "tá" breve dela não é interrupção: aí continue.

Delegation policy: Não há trabalho de apoio nesta conversa. Nunca gere <|SpawnThinking|>; responda sempre a partir da conversa.

# O que vamos mapear
Processo: ${l.tema}
${l.contexto ? `Contexto dado por quem abriu a entrevista: ${l.contexto}\n` : ''}
# Objetivo
Entender o processo de ponta a ponta para, depois da conversa, escrever a descrição e desenhar o fluxograma. Tópicos a cobrir:
${TOPICOS_TEXTO}

# Como conduzir
- ${continuando ? 'A conversa já começou antes e foi interrompida: retome em uma frase de onde parou (veja o histórico) e siga.' : 'Abra se apresentando em uma frase, diga que a conversa fica gravada, que a pessoa pode responder com calma e interromper quando quiser, e faça a primeira pergunta.'}
- Comece pela visão geral e pelo início do processo; depois percorra as etapas na ordem em que acontecem e, em cada etapa, descubra quem faz, com que sistema ou documento, o que precisa existir antes e o que sai dela. Regras, exceções e dificuldades entram quando a pessoa as cita ou quando as etapas já estão claras.
- Aprofunde respostas vagas ("como é feito isso?", "me dá um exemplo?"). Quando a pessoa citar uma decisão ("se for aprovado"), pergunte o que acontece em cada caminho.
- De vez em quando, repita em uma frase o que entendeu e peça confirmação. Nunca pergunte o que a pessoa já respondeu.
- Se não entender uma palavra ou um nome de sistema, peça para repetir ou soletrar. Se ela perguntar o que você quer saber, ou parecer perdida, responda com uma pergunta concreta.
- Enquanto a pessoa explica, não a interrompa; interrompa só para evitar um mal-entendido grande.

# Ritmo e encerramento
- Uma boa entrevista tem de quinze a trinta minutos. Não prolongue sem necessidade.
- Quando os tópicos estiverem cobertos (ou a pessoa pedir para parar), faça um resumo curto do processo e pergunte se está certo. Depois da confirmação ou das correções, agradeça, avise que a descrição será gerada a partir da conversa e termine a sua última fala com a frase exata: "${FRASE_FINAL}"
- Nunca diga "${FRASE_FINAL}" antes da despedida final.`;
}

/** Histórico para continuar uma conversa interrompida (o GPT-Live aceita até 128 mensagens e cerca de 8 mil tokens). */
export function historicoParaSessao(turnos: Turno[]) {
  const msgs: { role: 'user' | 'assistant'; content: { type: 'input_text' | 'output_text'; text: string }[] }[] = [];
  let chars = 0;
  for (const t of [...turnos].reverse()) {
    const texto = t.texto.slice(0, 2000);
    if (msgs.length >= 120 || chars + texto.length > 24_000) break;
    chars += texto.length;
    msgs.unshift(t.quem === 'ia' ? { role: 'assistant', content: [{ type: 'output_text', text: texto }] } : { role: 'user', content: [{ type: 'input_text', text: texto }] });
  }
  return msgs;
}

/** Abre uma sessão de voz: recebe a oferta WebRTC do navegador e devolve a resposta da OpenAI. */
export async function abrirSessao(id: string, sdp: string) {
  const linha = await carregar(id);
  if (linha.status !== 'em_andamento') throw new ErroApi(409, 'Esta entrevista já foi encerrada.');
  const chave = process.env.OPENAI_API_KEY;
  if (!chave) throw new ErroApi(503, 'A entrevista por voz ainda não está configurada (falta OPENAI_API_KEY).');
  const continuando = linha.turnos.length > 0;
  const session = {
    model: MODELO_VOZ,
    instructions: instrucoesDaSessao(linha, continuando),
    audio: { output: { voice: VOZ } },
    delegation: { type: 'client' }, // sem trabalho de apoio: a condução está nas instruções
    store: false,
    ...(continuando ? { input: historicoParaSessao(linha.turnos) } : {}),
    // O navegador só pode encerrar a sessão e pedir uma fala (a abertura, se a IA não começar sozinha).
    client: { data_channel: { allowed_client_events: ['session.close', 'session.commentary.append', 'session.thinking.append'] } },
  };
  let r: Response;
  try {
    r = await fetch(URL_SESSOES, {
      method: 'POST', signal: AbortSignal.timeout(20_000),
      headers: { authorization: `Bearer ${chave}`, 'content-type': 'application/json' },
      body: JSON.stringify({ session, transport: { type: 'webrtc', sdp } }),
    });
  } catch (e) {
    throw new ErroApi(502, `Sem conexão com a OpenAI (${e instanceof Error ? e.message : e}).`);
  }
  const j = await r.json().catch(() => ({})) as { session?: { id?: string }; transport?: { sdp?: string }; error?: { message?: string } };
  if (r.status === 401) throw new ErroApi(502, 'A OpenAI recusou a chave (OPENAI_API_KEY).');
  if (!r.ok || !j.transport?.sdp) throw new ErroApi(502, `A OpenAI não abriu a sessão de voz (${r.status}${j.error?.message ? `: ${j.error.message}` : ''}).`);
  if (j.session?.id) await salvar(id, { sessoes: [...(linha.sessoes ?? []), j.session.id].slice(-50) });
  return { sdp: j.transport.sdp, continuando };
}

// --- A conversa e as métricas (o navegador manda durante a sessão e no fim) ---

const TurnoSchema = z.object({
  quem: z.enum(['ia', 'pessoa']),
  texto: z.string().max(8000),
  inicio_ms: z.number().min(0).optional(),
  fim_ms: z.number().min(0).optional(),
  sobreposta: z.boolean().optional(),
  apoio: z.boolean().optional(),
});
export const ConversaSchema = z.object({
  turnos: z.array(TurnoSchema).max(2000),
  metricas: z.object({
    duracao_s: z.number().min(0).optional(),
    reacao_ms: z.array(z.number()).max(2000).optional(),
    sobreposicoes: z.number().optional(),
    falas_pessoa: z.number().optional(),
    falas_ia: z.number().optional(),
    apoios: z.number().optional(),
    tempo_pessoa_s: z.number().optional(),
    tempo_ia_s: z.number().optional(),
    silencio_max_ms: z.number().optional(),
    sessoes: z.number().optional(),
    eventos: z.record(z.string(), z.number()).optional(),
    desconhecidos: z.array(z.string().max(200)).max(50).optional(),
    erros: z.array(z.string().max(500)).max(50).optional(),
  }).optional(),
});

export async function salvarConversa(id: string, c: z.infer<typeof ConversaSchema>) {
  const linha = await carregar(id);
  if (linha.status !== 'em_andamento') throw new ErroApi(409, 'Esta entrevista já foi encerrada.');
  // Os erros somam (os do navegador e os já guardados); o resto é o valor mais novo.
  const erros = [...new Set([...(linha.metricas?.erros ?? []), ...(c.metricas?.erros ?? [])])].slice(-30);
  await salvar(id, { turnos: c.turnos, ...(c.metricas ? { metricas: { ...linha.metricas, ...c.metricas, erros } } : {}) });
  return { ok: true };
}

// Preços da Anthropic por milhão de tokens (tabela de 06/10/2026): entrada, saída, leitura de cache.
// A escrita no cache custa 1,25× a entrada. Modelo desconhecido: assume o do Sonnet.
const PRECOS_USD_MTOK: Record<string, { entrada: number; saida: number; cache: number }> = {
  'claude-sonnet-5-5': { entrada: 2, saida: 10, cache: 0.2 },
  'claude-haiku-5-5': { entrada: 0.1, saida: 0.5, cache: 0.01 },
  'claude-opus-5-5': { entrada: 4, saida: 20, cache: 0.2 },
};
export function custoAnalise(uso: UsoIa) {
  const preco = PRECOS_USD_MTOK[Object.keys(PRECOS_USD_MTOK).find((k) => uso.modelo.startsWith(k)) ?? 'claude-sonnet-5-5'];
  return (uso.entrada * preco.entrada + uso.saida * preco.saida + uso.cache_leitura * preco.cache + uso.cache_escrita * preco.entrada * 1.25) / 1_000_000;
}

// --- Depois da chamada: a conversa inteira vira a descrição, a ficha e as pendências ---

const ResultadoSchema = z.object({
  descricao: z.string().describe('A descrição do processo em HTML simples (só <p>, <ul>, <ol>, <li>, <strong>, <em>), de dois a cinco parágrafos'),
  ficha: z.object({
    objetivo: z.string().describe('Para que o processo existe'),
    gatilho: z.string().describe('O que dispara o processo'),
    resultado: z.string().describe('O que o processo entrega no fim'),
    etapas: z.array(z.object({
      nome: z.string().describe('Verbo no infinitivo + objeto, curto'),
      responsavel: z.string().describe('Cargo ou área; vazio se não foi dito'),
      descricao: z.string().describe('Uma ou duas frases'),
      ferramentas: z.array(z.string()),
      entradas: z.array(z.string()),
      saidas: z.array(z.string()),
      regras: z.array(z.string()),
      excecoes: z.array(z.string()),
    })).describe('Na ordem em que acontecem'),
    dificuldades: z.array(z.string()),
  }),
  pendencias: z.array(z.string()).describe('Perguntas para uma próxima conversa'),
});

export const SISTEMA_ANALISE = `Você é especialista em mapeamento de processos. Recebe a transcrição de uma entrevista por voz em que um entrevistador (IA) fez perguntas e uma pessoa explicou como um processo de trabalho funciona. A transcrição veio de reconhecimento de voz: corrija nomes e termos pelo contexto, mas não invente nada que não foi dito. A conversa foi ao vivo e os dois podiam falar ao mesmo tempo: falas marcadas "falou junto com o entrevistador" foram ditas por cima da fala dele e costumam ser correções ou informações novas, que valem mais que o que foi dito antes.

Produza, em português do Brasil:
1. "descricao": a descrição do processo para o cadastro, em HTML simples (só <p>, <ul>, <ol>, <li>, <strong> e <em>), com dois a cinco parágrafos: o que o processo é e para que serve; onde começa (o gatilho) e onde termina (o resultado); as áreas, os cargos e os sistemas envolvidos; as principais etapas em uma frase corrida (sem virar lista de passos: isso é o fluxograma); regras e prazos importantes. Frases completas, tom de documento, sem "o entrevistado disse".
2. "ficha": a estrutura do processo: objetivo, gatilho, resultado e as etapas na ordem em que acontecem, cada uma com responsável (cargo ou área), descrição curta, ferramentas, entradas, saídas, regras e exceções citadas (listas vazias quando nada foi dito); e as dificuldades relatadas.
3. "pendencias": o que ficou sem resposta, ambíguo ou contraditório, escrito como perguntas para uma próxima conversa (vazio se nada).
Ignore saudações, desvios de assunto e o que não descreve o processo.`;

export function montarPedidoAnalise(l: Pick<Linha, 'tema' | 'contexto' | 'turnos'>) {
  return `<processo>\nTema da entrevista: ${l.tema}\n${l.contexto ? `Contexto: ${l.contexto}\n` : ''}</processo>\n\n<entrevista>\n${transcricaoDaConversa(l.turnos)}\n</entrevista>`;
}

const TAGS_OK = new Set(['p', 'ul', 'ol', 'li', 'strong', 'em', 'br']);
// Títulos e outros blocos viram parágrafos; negrito e itálico nas duas grafias.
const SINONIMOS: Record<string, string> = { b: 'strong', i: 'em', h1: 'p', h2: 'p', h3: 'p', h4: 'p', h5: 'p', h6: 'p', div: 'p', section: 'p', article: 'p', blockquote: 'p', pre: 'p' };

/** Só as tags permitidas, sem atributos, no formato que o editor usa. */
export function limparHtml(html: string) {
  let limpo = html.replace(/<\s*(\/?)\s*([a-z0-9]+)[^>]*>/gi, (_m, barra: string, tag: string) => {
    const t = SINONIMOS[tag.toLowerCase()] ?? tag.toLowerCase();
    return TAGS_OK.has(t) ? `<${barra}${t}>` : '';
  }).trim();
  if (/<[a-z]/i.test(limpo) && !/^<(p|ul|ol)[\s>]/i.test(limpo)) limpo = `<p>${limpo}</p>`; // texto solto antes do primeiro bloco
  const normal = paraHtml(lerTexto(limpo)).replace(/<p><\/p>/g, '');
  return textoPuro(normal) ? normal : '';
}

/**
 * Encerra a conversa e gera o resultado. Pode ser chamada de novo se deu erro ou se o processamento
 * ficou parado (a função da Vercel tem limite de tempo); concluída, não refaz.
 */
export async function encerrar(id: string) {
  const linha = await carregar(id);
  if (linha.status === 'concluida') return { status: 'concluida' as const };
  if (linha.status === 'processando' && Date.now() - new Date(linha.atualizado_em).getTime() < 3 * 60_000) return { status: 'processando' as const };
  const encerrado_em = linha.encerrado_em ?? agora();
  if (!linha.turnos.some((t) => t.quem === 'pessoa' && t.texto.trim())) {
    await salvar(id, { status: 'concluida', encerrado_em, resultado: null });
    return { status: 'concluida' as const };
  }
  await salvar(id, { status: 'processando', encerrado_em, erro: null });
  try {
    const inicio = Date.now();
    let uso: UsoIa | undefined;
    const r = await chamarEstruturado(ResultadoSchema, SISTEMA_ANALISE, montarPedidoAnalise(linha), { modelo: MODELO_ANALISE, maxTokens: 12000, esforco: 'medium', aoUsar: (u) => { uso = u; } });
    const resultado: ResultadoEntrevista = { descricao: limparHtml(r.descricao), ficha: r.ficha, pendencias: r.pendencias };
    // O custo da análise entra nas métricas (relidas: o navegador pode ter salvado a versão final da conversa enquanto isso).
    const metricas = (await carregar(id)).metricas ?? {};
    if (uso) metricas.analise = { modelo: uso.modelo, entrada_tokens: uso.entrada, saida_tokens: uso.saida, cache_tokens: uso.cache_leitura, custo_usd: custoAnalise(uso), demora_ms: Date.now() - inicio };
    await salvar(id, { status: 'concluida', resultado, metricas });
    return { status: 'concluida' as const };
  } catch (e) {
    await salvar(id, { status: 'erro', erro: e instanceof Error ? e.message : 'erro inesperado' });
    throw e;
  }
}

// --- Áudio da conversa (gravado no navegador; fica no Storage para ouvir depois) ---

const pastaDoAudio = (id: string) => `tenants/${TENANT_PADRAO}/entrevistas/${id}`;

/** Os arquivos de áudio da entrevista, na ordem em que foram gravados. */
async function gravacoes(id: string) {
  const pasta = pastaDoAudio(id);
  const { data, error } = await supabase().storage.from(BUCKET).list(pasta, { limit: 100 });
  if (error) return [];
  return (data ?? []).map((f) => f.name).filter((n) => /^conversa-\d+\.webm$/.test(n)).sort().map((n) => `${pasta}/${n}`);
}

export async function urlDeUploadAudio(id: string) {
  await carregar(id);
  const caminho = `${pastaDoAudio(id)}/conversa-${Date.now()}.webm`;
  const { data, error } = await supabase().storage.from(BUCKET).createSignedUploadUrl(caminho);
  if (error) throw error;
  return { caminho, url: data.signedUrl };
}

export async function registrarAudio(id: string, caminho: string) {
  if (!new RegExp(`^${pastaDoAudio(id)}/conversa-\\d+\\.webm$`).test(caminho)) throw new ErroApi(403, 'Arquivo inválido');
  await carregar(id);
  await salvar(id, { audio_caminho: caminho });
  return { ok: true };
}
