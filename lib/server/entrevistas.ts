import 'server-only';
import { z } from 'zod';
import { IDS_TOPICOS, TOPICOS, transcricaoDaConversa, type ResultadoEntrevista, type StatusEntrevista, type Turno } from '@/lib/entrevista/topicos';
import { lerTexto, paraHtml, textoPuro } from '@/lib/pop/texto-rico';
import { ErroApi } from './http';
import { chamarEstruturado } from './ia';
import { TENANT_PADRAO, supabase } from './supabase';

// Entrevista por voz com a IA (decisão 39). Três serviços externos, cada um numa função:
// - a escuta ao vivo (AssemblyAI Universal-Streaming): o navegador liga direto, com um token temporário;
// - a conversa (Claude): a cada resposta da pessoa, decide o que dizer em seguida;
// - a voz (AssemblyAI TTS): transforma a fala da IA em áudio.
// Nada aparece na tela durante a chamada; a transcrição é o "ouvido" da IA. Quando a chamada termina, a
// conversa inteira é analisada de uma vez e vira a descrição do processo, a ficha e as pendências.

const BUCKET = 'gravacoes';
// A conversa precisa responder rápido (Haiku, sem raciocínio estendido); a análise no fim pode pensar (Sonnet).
const MODELO_CONVERSA = process.env.INCFLOW_MODELO_ENTREVISTA || 'claude-haiku-5-5';
const MODELO_ANALISE = process.env.INCFLOW_MODELO_ANALISE || 'claude-sonnet-5-5';
const MAX_PERGUNTAS = 40;

const ESCUTA = {
  url: process.env.INCFLOW_ESCUTA_URL || 'wss://streaming.assemblyai.com/v3/ws',
  token: process.env.INCFLOW_ESCUTA_TOKEN_URL || 'https://token.assemblyai.com/v1/token',
  modelo: process.env.INCFLOW_MODELO_ESCUTA || 'universal-3-6-pro', // US$ 0,45/h; 'universal-streaming-multilingual' custa US$ 0,15/h
};
const VOZ = {
  url: process.env.INCFLOW_VOZ_URL || 'https://tts.us.assemblyai.com/v1/speech',
  voz: process.env.INCFLOW_VOZ_ENTREVISTA || 'aai-benicio', // a voz em português do catálogo da AssemblyAI
};

export type Linha = {
  id: string; processo_id: string; status: StatusEntrevista;
  turnos: Turno[]; cobertos: string[]; anotacoes: string[];
  resultado: ResultadoEntrevista | null; erro: string | null; audio_caminho: string | null;
  criado_em: string; encerrado_em: string | null; atualizado_em: string;
};
const CAMPOS = 'id, processo_id, status, turnos, cobertos, anotacoes, resultado, erro, audio_caminho, criado_em, encerrado_em, atualizado_em';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const agora = () => new Date().toISOString();

function chaveAssembly() {
  const k = process.env.ASSEMBLYAI_API_KEY;
  if (!k) throw new ErroApi(503, 'A entrevista por voz ainda não está configurada (falta ASSEMBLYAI_API_KEY).');
  return k;
}

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

// --- O processo que está sendo mapeado (contexto para a IA) ---

export type Contexto = { id: string; codigo: string; nome: string; descricao: string; area: string | null; organizacao: string | null; arquivado: boolean; tem_fluxograma: boolean; pops: string[] };

async function contextoDoProcesso(processoId: string): Promise<Contexto> {
  const db = supabase();
  const [p, f, o] = await Promise.all([
    db.from('processos').select('id, codigo, nome, descricao, arquivado_em, area:areas(nome, organizacao:organizacoes(nome))').eq('tenant_id', TENANT_PADRAO).eq('id', processoId).maybeSingle(),
    db.from('fluxogramas').select('id').eq('tenant_id', TENANT_PADRAO).eq('processo_id', processoId).maybeSingle(),
    db.from('pops').select('nome').eq('tenant_id', TENANT_PADRAO).eq('processo_id', processoId).is('arquivado_em', null),
  ]);
  for (const r of [p, f, o]) if (r.error) throw r.error;
  if (!p.data) throw new ErroApi(404, 'Processo não encontrado');
  const area = p.data.area as unknown as { nome: string; organizacao: { nome: string } | null } | null;
  return {
    id: p.data.id as string, codigo: p.data.codigo as string, nome: p.data.nome as string, descricao: (p.data.descricao as string | null) ?? '',
    area: area?.nome ?? null, organizacao: area?.organizacao?.nome ?? null, arquivado: !!p.data.arquivado_em,
    tem_fluxograma: !!f.data, pops: (o.data ?? []).map((x) => x.nome as string),
  };
}

/** Nomes que a escuta tende a errar: o processo, a área, a organização e os POPs (keyterms da AssemblyAI). */
export const termosDoProcesso = (ctx: Contexto) =>
  [...new Set([ctx.nome, ctx.area, ctx.organizacao, ...ctx.pops].filter((x): x is string => !!x && x.trim().length > 1).map((x) => x.trim().slice(0, 80)))].slice(0, 40);

// --- A conversa: o que a IA diz a cada vez ---

const TOPICOS_TEXTO = TOPICOS.map((t) => `- [${t.id}] ${t.nome}: ${t.o_que}`).join('\n');

export const SISTEMA_ENTREVISTA = `Você é consultor(a) de mapeamento de processos e está conduzindo uma ENTREVISTA POR VOZ com uma pessoa que executa ou conhece bem um processo de trabalho. Tudo o que você escrever em "fala" é lido em voz alta por uma voz sintética; a pessoa responde falando, e a fala dela chega a você transcrita por reconhecimento de voz (pode ter erros em nomes de sistemas, siglas e números).

Objetivo: entender o processo de ponta a ponta para, depois da conversa, escrever a descrição do processo e desenhar o fluxograma. Tópicos a cobrir (o id entre colchetes é o que você usa em "cobertos"):
${TOPICOS_TEXTO}

Como conduzir:
- Uma pergunta por vez, curta e direta, em português do Brasil falado, tratando a pessoa por "você". Nada de listas, markdown, siglas que a pessoa não usou nem perguntas duplas. Números pequenos por extenso.
- Comece pela visão geral e pelo início do processo. Depois percorra as etapas na ordem em que acontecem e, em cada etapa, descubra quem faz, com que sistema ou documento, o que precisa existir antes e o que sai dela. Regras, exceções e dificuldades entram quando a pessoa as cita ou quando as etapas já estão claras.
- Aprofunde respostas vagas ("como é feito isso?", "me dá um exemplo?"). Quando a pessoa citar uma decisão ("se for aprovado"), pergunte o que acontece em cada caminho.
- De vez em quando, repita em uma frase o que entendeu e peça confirmação. Nunca pergunte o que a pessoa já respondeu.
- Se não entender uma palavra ou um nome, peça para repetir ou soletrar. Se a pessoa fugir do assunto, acolha em uma frase e volte ao processo. Se ela pedir para parar, vá direto para o encerramento.
- A pessoa pode falar por cima de você (a transcrição marca "interrompeu o entrevistador" e quanto da sua fala chegou a tocar). Aí responda ao que ela disse e siga dali; não repita o que foi cortado, a não ser que ela peça.
- Encerramento: quando todos os tópicos estiverem cobertos (ou a conversa já estiver longa), faça um resumo curto do processo e pergunte se está certo. Depois da confirmação ou das correções, agradeça, avise que a descrição e o fluxograma serão gerados a partir da conversa e marque "encerrar": true nessa última fala.
- Ritmo: uma boa entrevista tem de quinze a trinta perguntas. Não prolongue sem necessidade.

Responda sempre com:
- "fala": o que dizer agora (a reação à última fala da pessoa, se couber, e a próxima pergunta).
- "cobertos": ids de TODOS os tópicos já razoavelmente cobertos até aqui, incluindo os de antes.
- "anotacao": uma frase objetiva com o que a última resposta revelou sobre o processo (vazia se nada novo).
- "encerrar": true só na despedida final.`;

const RespostaTurno = z.object({
  fala: z.string().min(1),
  cobertos: z.array(z.string()),
  anotacao: z.string(),
  encerrar: z.boolean(),
});

export function montarPedidoTurno(ctx: Contexto, linha: Pick<Linha, 'turnos' | 'cobertos' | 'anotacoes'>) {
  const perguntas = linha.turnos.filter((t) => t.quem === 'ia').length;
  const cabecalho = [
    '<processo>',
    `Nome: ${ctx.nome}`,
    `Área: ${ctx.area ?? 'não informada'} · Organização: ${ctx.organizacao ?? 'não informada'}`,
    `POPs já escritos deste processo: ${ctx.pops.length ? ctx.pops.join('; ') : 'nenhum'}`,
    `Descrição já cadastrada: ${textoPuro(ctx.descricao).slice(0, 1500) || 'nenhuma'}`,
    '</processo>',
  ].join('\n');
  const estado = `<topicos_cobertos>${linha.cobertos.join(', ') || 'nenhum ainda'}</topicos_cobertos>\n<anotacoes>\n${linha.anotacoes.map((a) => `- ${a}`).join('\n') || '(nenhuma)'}\n</anotacoes>`;
  const conversa = linha.turnos.length ? `<conversa>\n${transcricaoDaConversa(linha.turnos)}\n</conversa>\nPerguntas feitas até agora: ${perguntas}.` : '';
  const instrucao = !linha.turnos.length
    ? 'A conversa ainda não começou. Apresente-se em uma ou duas frases como a assistente de mapeamento do INCFlow, diga que a conversa fica gravada, que a pessoa pode responder com calma e pedir para parar quando quiser, e faça a primeira pergunta.'
    : perguntas >= MAX_PERGUNTAS
      ? 'A conversa já está longa: faça o resumo do processo e encaminhe o encerramento.'
      : 'Responda à última fala do entrevistado e faça a próxima pergunta.';
  return [cabecalho, estado, conversa, instrucao].filter(Boolean).join('\n\n');
}

/** Une os tópicos já cobertos com os que a IA marcou agora (só ids conhecidos, na ordem da lista). */
export const juntarCobertos = (antes: string[], novos: string[]) => {
  const todos = new Set([...antes, ...novos]);
  return IDS_TOPICOS.filter((id) => todos.has(id));
};

export type Interrupcao = { interrompeu: true; ouviu: number };

/** Pede a próxima fala da IA e guarda a conversa; `textoPessoa` vazio é a abertura. */
async function proximaFala(linha: Linha, ctx: Contexto, textoPessoa?: string, corte?: Interrupcao) {
  const turnos: Turno[] = textoPessoa
    ? [...linha.turnos, { quem: 'pessoa', texto: textoPessoa, em: agora(), ...(corte ? { interrompeu: true, ouviu: Math.max(0, Math.min(1, corte.ouviu)) } : {}) }]
    : [...linha.turnos];
  const r = await chamarEstruturado(RespostaTurno, SISTEMA_ENTREVISTA, montarPedidoTurno(ctx, { ...linha, turnos }), {
    modelo: MODELO_CONVERSA, pensar: false, esforco: 'low', maxTokens: 700, limiteMs: 50_000,
  });
  const fala = r.fala.trim();
  turnos.push({ quem: 'ia', texto: fala, em: agora() });
  const cobertos = juntarCobertos(linha.cobertos, r.cobertos);
  const anotacao = r.anotacao.trim();
  const anotacoes = anotacao ? [...linha.anotacoes, anotacao].slice(-80) : linha.anotacoes;
  await salvar(linha.id, { turnos, cobertos, anotacoes });
  return { fala, encerrar: r.encerrar, cobertos, perguntas: turnos.filter((t) => t.quem === 'ia').length };
}

export async function criar(processoId: string) {
  const ctx = await contextoDoProcesso(processoId);
  if (ctx.arquivado) throw new ErroApi(409, 'O processo está arquivado: restaure antes de entrevistar.');
  const { data, error } = await supabase().from('entrevistas')
    .insert({ tenant_id: TENANT_PADRAO, processo_id: processoId, status: 'em_andamento', turnos: [], cobertos: [], anotacoes: [] })
    .select(CAMPOS).single();
  if (error) throw error;
  const linha = data as Linha;
  const r = await proximaFala(linha, ctx);
  return { id: linha.id, fala: r.fala };
}

export async function responderTurno(id: string, texto: string, corte?: Interrupcao) {
  const linha = await carregar(id);
  if (linha.status !== 'em_andamento') throw new ErroApi(409, 'Esta entrevista já foi encerrada.');
  return proximaFala(linha, await contextoDoProcesso(linha.processo_id), texto.trim(), corte);
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

export const SISTEMA_ANALISE = `Você é especialista em mapeamento de processos. Recebe a transcrição de uma entrevista por voz em que um entrevistador (IA) fez perguntas e uma pessoa explicou como um processo de trabalho funciona. A transcrição veio de reconhecimento de voz: corrija nomes e termos pelo contexto, mas não invente nada que não foi dito.

Produza, em português do Brasil:
1. "descricao": a descrição do processo para o cadastro, em HTML simples (só <p>, <ul>, <ol>, <li>, <strong> e <em>), com dois a cinco parágrafos: o que o processo é e para que serve; onde começa (o gatilho) e onde termina (o resultado); as áreas, os cargos e os sistemas envolvidos; as principais etapas em uma frase corrida (sem virar lista de passos: isso é o fluxograma); regras e prazos importantes. Frases completas, tom de documento, sem "o entrevistado disse".
2. "ficha": a estrutura do processo: objetivo, gatilho, resultado e as etapas na ordem em que acontecem, cada uma com responsável (cargo ou área), descrição curta, ferramentas, entradas, saídas, regras e exceções citadas (listas vazias quando nada foi dito); e as dificuldades relatadas.
3. "pendencias": o que ficou sem resposta, ambíguo ou contraditório, escrito como perguntas para uma próxima conversa (vazio se nada).
Ignore saudações, desvios de assunto e o que não descreve o processo.`;

export function montarPedidoAnalise(ctx: Contexto, turnos: Turno[]) {
  return `<processo>\nNome: ${ctx.nome}\nÁrea: ${ctx.area ?? 'não informada'} · Organização: ${ctx.organizacao ?? 'não informada'}\nDescrição já cadastrada: ${textoPuro(ctx.descricao).slice(0, 1500) || 'nenhuma'}\n</processo>\n\n<entrevista>\n${transcricaoDaConversa(turnos)}\n</entrevista>`;
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
  if (!linha.turnos.some((t) => t.quem === 'pessoa')) {
    await salvar(id, { status: 'concluida', encerrado_em, resultado: null });
    return { status: 'concluida' as const };
  }
  await salvar(id, { status: 'processando', encerrado_em, erro: null });
  try {
    const ctx = await contextoDoProcesso(linha.processo_id);
    const r = await chamarEstruturado(ResultadoSchema, SISTEMA_ANALISE, montarPedidoAnalise(ctx, linha.turnos), { modelo: MODELO_ANALISE, maxTokens: 12000, esforco: 'medium' });
    const resultado: ResultadoEntrevista = { descricao: limparHtml(r.descricao), ficha: r.ficha, pendencias: r.pendencias };
    await salvar(id, { status: 'concluida', resultado });
    return { status: 'concluida' as const };
  } catch (e) {
    await salvar(id, { status: 'erro', erro: e instanceof Error ? e.message : 'erro inesperado' });
    throw e;
  }
}

// --- Leitura ---

export async function obter(id: string) {
  const linha = await carregar(id);
  const ctx = await contextoDoProcesso(linha.processo_id);
  let audio_url: string | null = null;
  if (linha.audio_caminho) {
    const { data } = await supabase().storage.from(BUCKET).createSignedUrl(linha.audio_caminho, 60 * 60);
    audio_url = data?.signedUrl ?? null;
  }
  return {
    ...linha,
    audio_url,
    processo: { id: ctx.id, codigo: ctx.codigo, nome: ctx.nome, area: ctx.area, organizacao: ctx.organizacao, arquivado: ctx.arquivado, descricao_vazia: !textoPuro(ctx.descricao), tem_fluxograma: ctx.tem_fluxograma },
  };
}

export async function listar(processoId: string) {
  const { data, error } = await supabase().from('entrevistas').select('id, status, turnos, criado_em, encerrado_em')
    .eq('tenant_id', TENANT_PADRAO).eq('processo_id', processoId).order('criado_em', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(({ turnos, ...e }) => {
    const t = (turnos as Turno[] | null) ?? [];
    return { ...e, perguntas: t.filter((x) => x.quem === 'ia').length, respostas: t.filter((x) => x.quem === 'pessoa').length };
  });
}

export async function excluir(id: string) {
  const linha = await carregar(id);
  if (linha.audio_caminho) await supabase().storage.from(BUCKET).remove([linha.audio_caminho]);
  const { error } = await supabase().from('entrevistas').delete().eq('tenant_id', TENANT_PADRAO).eq('id', id);
  if (error) throw error;
}

// --- Escuta ao vivo (token temporário para o navegador ligar direto na AssemblyAI) ---

export async function escuta(id: string) {
  const linha = await carregar(id);
  if (linha.status !== 'em_andamento') throw new ErroApi(409, 'Esta entrevista já foi encerrada.');
  const chave = chaveAssembly();
  let r: Response;
  try {
    r = await fetch(ESCUTA.token, {
      method: 'POST', signal: AbortSignal.timeout(10_000),
      headers: { authorization: chave, 'content-type': 'application/json' },
      // O token só serve para abrir a conexão (60 s); a sessão dura no máximo 2 h.
      body: JSON.stringify({ product: 'streaming', expires_in_seconds: 60, max_session_duration_seconds: 2 * 3600 }),
    });
  } catch (e) {
    throw new ErroApi(502, `Sem conexão com a AssemblyAI (${e instanceof Error ? e.message : e}).`);
  }
  const j = await r.json().catch(() => ({})) as { token?: string; error?: string; message?: string };
  if (!r.ok || !j.token) throw new ErroApi(502, `A AssemblyAI não liberou a escuta (${r.status}${j.error || j.message ? `: ${j.error || j.message}` : ''}).`);
  const ctx = await contextoDoProcesso(linha.processo_id);
  const q = new URLSearchParams({
    token: j.token, speech_model: ESCUTA.modelo, sample_rate: '16000', encoding: 'pcm_s16le',
    // Quem explica um processo pensa em voz alta: espera mais antes de dar a fala por encerrada.
    min_turn_silence: '400', max_turn_silence: '1600',
  });
  if (ESCUTA.modelo.startsWith('universal-3')) q.set('language_codes', 'pt');
  else { q.set('format_turns', 'true'); q.set('end_of_turn_confidence_threshold', '0.5'); }
  return { url: `${ESCUTA.url}?${q}`, termos: termosDoProcesso(ctx) };
}

// --- Voz da IA (texto → áudio WAV) ---

export async function voz(id: string, texto: string) {
  await carregar(id);
  const chave = chaveAssembly();
  let r: Response;
  try {
    r = await fetch(VOZ.url, {
      method: 'POST', signal: AbortSignal.timeout(40_000),
      headers: { authorization: chave, 'content-type': 'application/json' },
      body: JSON.stringify({ text: texto.slice(0, 4500), voice_id: VOZ.voz, language: 'portuguese', container: 'wav', encoding: 'pcm_s16le', sample_rate: 24000, stream: false }),
    });
  } catch (e) {
    throw new ErroApi(502, `Sem conexão com a voz da AssemblyAI (${e instanceof Error ? e.message : e}).`);
  }
  if (!r.ok) {
    const j = await r.json().catch(() => ({})) as { message?: string; error?: string };
    throw new ErroApi(502, `A voz da AssemblyAI falhou (${r.status}${j.message || j.error ? `: ${j.message || j.error}` : ''}).`);
  }
  return { audio: await r.arrayBuffer(), tipo: r.headers.get('content-type') || 'audio/wav' };
}

// --- Áudio da conversa (gravado no navegador; fica no Storage para ouvir depois) ---

const caminhoDoAudio = (id: string) => `tenants/${TENANT_PADRAO}/entrevistas/${id}/conversa.webm`;

export async function urlDeUploadAudio(id: string) {
  await carregar(id);
  const caminho = caminhoDoAudio(id);
  const { data, error } = await supabase().storage.from(BUCKET).createSignedUploadUrl(caminho, { upsert: true });
  if (error) throw error;
  return { caminho, url: data.signedUrl };
}

export async function registrarAudio(id: string, caminho: string) {
  if (caminho !== caminhoDoAudio(id)) throw new ErroApi(403, 'Arquivo inválido');
  await carregar(id);
  await salvar(id, { audio_caminho: caminho });
  return { ok: true };
}
