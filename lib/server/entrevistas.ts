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
const MODELO_CONSULTA = process.env.INCFLOW_MODELO_CONSULTA || 'claude-haiku-5-5'; // rápido: a pessoa está esperando
const URL_SESSOES = process.env.INCFLOW_LIVE_URL || 'https://api.openai.com/v1/live/sessions';
/** A expressão da despedida: quando a IA a diz (e termina de falar), o app encerra a entrevista sozinho. */
export const FRASE_FINAL = 'Vamos concluir por aqui';
// Quem é a entrevistadora (fase de teste, decisão 45): nome e com quem trabalha, ditos na abertura.
const NOME_IA = 'JOI';
const COM_QUEM = 'com o Rafael Brasil, na área de processos da INC';

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
    return { ...e, falas: t.length, duracao_s: m.duracao_s ?? 0, custo_analise_usd: m.analise?.custo_usd ?? 0, custo_consultas_usd: (m.consultas ?? []).reduce((a, c) => a + (c.custo_usd || 0), 0) };
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
Você é a ${NOME_IA}, consultora de mapeamento de processos, fazendo uma entrevista por voz, ao vivo, com uma pessoa que executa ou conhece bem um processo de trabalho. Você trabalha ${COM_QUEM} (o INCFlow é a plataforma de processos da INC). Fale sempre em português do Brasil, com naturalidade, tratando a pessoa por "você". Se perguntarem, diga que é uma inteligência artificial.

# Jeito de falar
- Ritmo de conversa: frases completas e fluidas, com pausas só entre frases, nunca longas no meio de uma frase. Sem muletas ("eh", "é...", "né") e sem repetir palavras.
- Curto e direto: uma ideia por vez, uma pergunta por vez. Números pequenos por extenso. Nada de listas faladas.
- Assim que a pessoa terminar a frase, responda sem demora. Se ela pausar para pensar e continuar, você só ouve. Nunca fique só no "aham" esperando: terminou, a vez é sua.
- Quando couber, reaja em poucas palavras ("Entendi.", "Faz sentido.") e emende a próxima pergunta.
- Pronúncia: "INC" é uma palavra só e se fala "ínqui" (como "ink", em inglês); nunca soletre as letras. "INCFlow" se fala "ínqui flôu". O seu nome, "${NOME_IA}", se fala "djói" (como "joy", em inglês).

Backchannel policy: Use sons curtos de escuta ("aham", "uhum", "sei") com moderação enquanto a pessoa explica, sem competir com a fala dela. Um som de escuta nunca substitui uma resposta.

Interruption policy: Quando a pessoa começar a falar por cima de você, pare de falar imediatamente, mesmo no meio da frase, e ouça até ela terminar; depois responda ao que ela disse. Se ela pedir para parar ou esperar, corrigir algo, fazer uma pergunta ou pedir para encerrar, pare na hora, sem terminar a frase e sem acrescentar nada. Não retome o que foi cortado, a não ser que ela peça. Só um "aham", "uhum", "sei" ou "tá" breve dela não é interrupção: aí continue.

Delegation policy: Quando a pessoa pedir para você pesquisar, verificar ou explicar algo de conhecimento geral (o que é um sistema, uma sigla, uma lei, uma prática de mercado), ou quando você precisar disso para entender o que ela disse, gere <|SpawnThinking|> e diga em poucas palavras que vai ver ("Deixa eu ver aqui."). Quando o resultado chegar, conte o essencial em uma ou duas frases e volte ao processo com uma pergunta que ligue o que você descobriu ao que a pessoa contou. Nunca gere <|SpawnThinking|> para saber como o processo dela funciona: isso só ela sabe, então pergunte a ela. Não prometa responder depois ("te respondo já"): consulte agora ou diga que não sabe e siga.

# O que vamos mapear
Processo: ${l.tema}
${l.contexto ? `Contexto dado por quem abriu a entrevista: ${l.contexto}\n` : ''}
# Objetivo
Entender o processo de ponta a ponta para, depois da conversa, escrever a descrição e desenhar o fluxograma. Tópicos a cobrir:
${TOPICOS_TEXTO}

# Como conduzir
- ${continuando ? 'A conversa já começou antes e foi interrompida: retome em uma frase de onde parou (veja o histórico) e siga.' : `Abra curto, em no máximo duas frases, e já faça a primeira pergunta: diga quem você é, com quem trabalha e que a conversa fica gravada. Por exemplo: "Oi, eu sou a ${NOME_IA}, trabalho ${COM_QUEM.replace(' da INC', '')}. Essa conversa fica gravada, tá? Pra começar, me conta: para que serve esse processo?"`}
- Comece pela visão geral e pelo início do processo; depois percorra as etapas na ordem em que acontecem e, em cada etapa, descubra quem faz, com que sistema ou documento, o que precisa existir antes e o que sai dela. Regras, exceções e dificuldades entram quando a pessoa as cita ou quando as etapas já estão claras.
- Aprofunde respostas vagas ("como é feito isso?", "me dá um exemplo?"). Quando a pessoa citar uma decisão ("se for aprovado"), pergunte o que acontece em cada caminho.
- De vez em quando, repita em uma frase o que entendeu e peça confirmação. Nunca pergunte o que a pessoa já respondeu.
- Se não entender uma palavra ou um nome de sistema, peça para repetir ou soletrar. Se ela perguntar o que você quer saber, ou parecer perdida, responda com uma pergunta concreta.
- Enquanto a pessoa explica, não a interrompa; interrompa só para evitar um mal-entendido grande.
- Se a pessoa pedir um instante, espere em silêncio até ela voltar.

# Ritmo e encerramento
- A entrevista termina quando os tópicos estiverem cobertos, não pelo tempo. Antes de resumir, repasse os tópicos e explore o que ainda estiver em aberto, uma pergunta por vez. Confira em especial: o que acontece quando uma aprovação ou decisão é negada ou algo dá errado; prazos; quem participa de cada etapa; com que frequência o processo acontece; o que costuma dar problema. Se a pessoa não souber responder, siga para o próximo ponto (vira pendência).
- "Acho que é isso" ou "tá bom" depois de um resumo não é pedido para encerrar: se ainda houver lacuna, pergunte.
- Com os tópicos cobertos, faça um resumo curto do processo e pergunte se está certo. Depois da confirmação ou das correções, despeça-se em uma ou duas frases, como numa conversa de verdade, dizendo "${FRASE_FINAL.toLowerCase()}". Por exemplo: "Olha, acho que deu para entender bem o processo. Então ${FRASE_FINAL.toLowerCase()}. Muito obrigada pela conversa!"
- Se a pessoa disser que quer parar ou precisa sair com pontos ainda em aberto, diga em uma frase o que falta e pergunte se dá para responder só mais uma ou duas perguntas rápidas. Se ela repetir que acabou, disser que não pode ou que precisa sair, não insista: agradeça e despeça-se na hora, dizendo "${FRASE_FINAL.toLowerCase()}" (o que ficou faltando vira pendência para uma próxima conversa).
- "${FRASE_FINAL}" encerra a entrevista: diga só na despedida, uma única vez. Não use frases de sistema como "entrevista concluída".`;
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
    delegation: { type: 'client' }, // as consultas ("deixa eu ver aqui") quem faz é o app, com o Claude (decisão 44)
    store: false,
    ...(continuando ? { input: historicoParaSessao(linha.turnos) } : {}),
    // O navegador só pode encerrar a sessão, pedir uma fala (a abertura, se a IA não começar sozinha) e
    // entregar o resultado de uma consulta.
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

// --- Consulta durante a conversa: a IA pede ("deixa eu ver aqui"), o Claude responde, ela fala (decisão 44) ---
// O GPT-Live não manda o assunto da consulta (só avisa que quer uma): o navegador manda o fim da conversa e o
// Claude descobre o que é para verificar. Só conhecimento geral: sobre o processo, quem sabe é a pessoa.

const ConsultaSchema = z.object({
  pergunta: z.string().describe('O que a entrevistadora foi verificar, em uma frase curta'),
  resposta: z.string().describe('De uma a três frases curtas, para ela dizer em voz alta'),
});

export const SISTEMA_CONSULTA = `Você apoia, nos bastidores, uma consultora que está entrevistando uma pessoa por voz para mapear um processo de trabalho. No meio da conversa ela disse que ia verificar uma coisa e espera a sua resposta para continuar falando. Pelo fim da conversa, descubra o que ela precisa saber (em geral, o que a pessoa pediu para ela pesquisar ou explicar: um sistema, uma sigla, um termo, uma lei, uma prática comum) e responda.

- "pergunta": o que foi verificado, em uma frase curta.
- "resposta": de uma a três frases curtas e simples, em português do Brasil, para serem ditas em voz alta: só o essencial, sem listas e sem marcações.
- Use conhecimento geral. Não afirme nada sobre a empresa ou sobre o processo da pessoa: isso só ela sabe (no máximo, diga como costuma ser e sugira confirmar com ela).
- A conversa veio de reconhecimento de voz: corrija nomes pelo contexto (por exemplo, "TOTOS" é TOTVS).
- Se não souber ou não tiver certeza, diga isso com franqueza em uma frase.`;

export function montarPedidoConsulta(l: Pick<Linha, 'tema' | 'contexto'>, turnos: Turno[]) {
  let fim = transcricaoDaConversa(turnos.slice(-30));
  if (fim.length > 8000) fim = fim.slice(-8000);
  return `<processo>\nTema da entrevista: ${l.tema}\n${l.contexto ? `Contexto: ${l.contexto}\n` : ''}</processo>\n\n<fim_da_conversa>\n${fim}\n</fim_da_conversa>`;
}

export async function consultar(id: string, turnos: Turno[]) {
  const linha = await carregar(id);
  if (linha.status !== 'em_andamento') throw new ErroApi(409, 'Esta entrevista já foi encerrada.');
  const inicio = Date.now();
  let uso: UsoIa | undefined;
  const r = await chamarEstruturado(ConsultaSchema, SISTEMA_CONSULTA, montarPedidoConsulta(linha, turnos), { modelo: MODELO_CONSULTA, maxTokens: 800, pensar: false, esforco: 'low', limiteMs: 12_000, aoUsar: (u) => { uso = u; } });
  return { pergunta: r.pergunta.trim().slice(0, 300), resposta: r.resposta.trim().slice(0, 1200), modelo: uso?.modelo ?? MODELO_CONSULTA, demora_ms: Date.now() - inicio, custo_usd: uso ? custoAnalise(uso) : 0 };
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
export const ConsultaPedidoSchema = z.object({ turnos: z.array(TurnoSchema).max(60) });

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
    conexao_ms: z.number().min(0).optional(),
    abertura_ms: z.number().min(0).optional(),
    consultas: z.array(z.object({
      pergunta: z.string().max(300),
      resposta: z.string().max(1500),
      demora_ms: z.number().min(0),
      custo_usd: z.number().min(0).max(1),
      falhou: z.boolean().optional(),
    })).max(30).optional(),
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
Ignore saudações, desvios de assunto e o que não descreve o processo. O que o entrevistador explicou por conta própria (por exemplo, o que é um sistema, depois de verificar) é conhecimento geral: use para entender a conversa, mas registre como fato do processo só o que a pessoa disse ou confirmou.`;

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
