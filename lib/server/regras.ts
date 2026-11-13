import 'server-only';
import { z } from 'zod';
import { MAX_PENDENCIAS, codigoDaRegra, transcricaoNumerada, type PerfilEntrevistado, type TipoRegra, type Turno } from '@/lib/entrevista/topicos';
import { textoPuro } from '@/lib/pop/texto-rico';
import { ErroApi } from './http';
import type { Pessoa } from './login';
import { TENANT_PADRAO, supabase } from './supabase';

// Regras de negócio do processo (decisão 89). A Maia sugere as regras a partir das entrevistas de regras de
// negócio, cada uma com o trecho da fala de onde saiu; nada passa a valer sem confirmação. Quem confirma é a
// pessoa escolhida para o processo por um gestor ou administrador (pode ser a própria pessoa entrevistada) e os
// administradores. Só a regra confirmada ganha código (RN-01, RC-01). Regra escrita à mão por quem confirma já
// nasce confirmada.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const agora = () => new Date().toISOString();

export type SituacaoRegra = 'sugerida' | 'confirmada' | 'descartada' | 'arquivada';
type Linha = {
  id: string; processo_id: string; tipo: TipoRegra; texto: string; situacao: SituacaoRegra; numero: number | null; pop_id: string | null;
  origem: 'maia' | 'manual'; entrevista_id: string | null; trecho: string; trecho_ms: number | null;
  conflito_regra_id: string | null; conflito: string; perguntar_em: string | null; esclarecimento: string; esclarecimento_entrevista_id: string | null;
  criado_por: string | null; confirmada_por: string | null; confirmada_em: string | null; criado_em: string; atualizado_em: string;
};
const CAMPOS = 'id, processo_id, tipo, texto, situacao, numero, pop_id, origem, entrevista_id, trecho, trecho_ms, conflito_regra_id, conflito, perguntar_em, esclarecimento, esclarecimento_entrevista_id, criado_por, confirmada_por, confirmada_em, criado_em, atualizado_em';

// --- A migração 0024 já está no banco? Enquanto não estiver, o app segue como antes, sem regras ---

let pronto = false;
let conferidoEm = 0;
/** Verdadeiro quando o banco já tem a finalidade das entrevistas e a tabela de regras (migração 0024). */
export async function bancoTemRegras() {
  if (pronto) return true;
  if (Date.now() - conferidoEm < 60_000) return false; // não insiste a cada pedido
  conferidoEm = Date.now();
  try {
    const [a, b] = await Promise.all([
      supabase().from('entrevistas').select('finalidade').limit(1),
      supabase().from('regras').select('id').limit(1),
    ]);
    pronto = !a.error && !b.error;
  } catch {
    pronto = false; // sem resposta do banco: segue sem as regras e confere de novo daqui a pouco
  }
  return pronto;
}
const MSG_SEM_BANCO = 'As regras de negócio ainda não estão ligadas neste ambiente (falta aplicar a migração 0024 no banco).';
async function exigirBanco() {
  if (!(await bancoTemRegras())) throw new ErroApi(503, MSG_SEM_BANCO, 'sem_regras');
}

// --- Acesso ---

type ProcessoDasRegras = { id: string; nome: string; arquivado_em: string | null; confirmador_regras_id: string | null };
async function processoDasRegras(id: string) {
  if (!UUID.test(id)) throw new ErroApi(404, 'Processo não encontrado');
  const { data, error } = await supabase().from('processos').select('id, nome, arquivado_em, confirmador_regras_id').eq('tenant_id', TENANT_PADRAO).eq('id', id).maybeSingle();
  if (error) throw error;
  if (!data) throw new ErroApi(404, 'Processo não encontrado');
  return data as ProcessoDasRegras;
}

/** Quem confirma, edita e descarta regras: a pessoa escolhida para o processo e os administradores. Sem login (desenvolvimento), liberado. */
export const podeConfirmar = (pessoa: Pessoa | null | undefined, processo: Pick<ProcessoDasRegras, 'confirmador_regras_id'>) =>
  !pessoa || pessoa.nivel === 'admin' || (!!processo.confirmador_regras_id && processo.confirmador_regras_id === pessoa.id);

function exigirConfirmador(pessoa: Pessoa | null | undefined, processo: ProcessoDasRegras) {
  if (processo.arquivado_em) throw new ErroApi(409, 'Este processo está arquivado.');
  if (!podeConfirmar(pessoa, processo)) throw new ErroApi(403, 'Só quem foi escolhido para confirmar as regras deste processo, ou um administrador, pode fazer isso.', 'nao_confirma');
}

async function carregar(id: string) {
  if (!UUID.test(id)) throw new ErroApi(404, 'Regra não encontrada');
  const { data, error } = await supabase().from('regras').select(CAMPOS).eq('tenant_id', TENANT_PADRAO).eq('id', id).maybeSingle();
  if (error) throw error;
  if (!data) throw new ErroApi(404, 'Regra não encontrada');
  return data as Linha;
}

async function nomes(ids: (string | null | undefined)[]) {
  const unicos = [...new Set(ids.filter((x): x is string => !!x))];
  if (!unicos.length) return new Map<string, string>();
  const { data, error } = await supabase().from('pessoas').select('id, nome').in('id', unicos);
  if (error) throw error;
  return new Map(((data ?? []) as { id: string; nome: string }[]).map((p) => [p.id, p.nome]));
}

type PopDoProcesso = { id: string; nome: string; identificacao: string | null; objetivo?: unknown };
const rotuloDoPop = (p: Pick<PopDoProcesso, 'nome' | 'identificacao'>) => (p.identificacao?.trim() ? `POP ${p.identificacao.trim()}` : p.nome);
async function popsDoProcesso(processoId: string, comObjetivo = false) {
  const { data, error } = await supabase().from('pops').select(`id, nome, identificacao${comObjetivo ? ', objetivo:conteudo->objetivo' : ''}`).eq('tenant_id', TENANT_PADRAO).eq('processo_id', processoId).is('arquivado_em', null).order('criado_em');
  if (error) throw error;
  return (data ?? []) as unknown as PopDoProcesso[];
}

// --- A aba "Regras de negócio" do processo ---

/** Tudo o que a aba mostra: as regras para revisar e as confirmadas, quem confirma, os POPs e as conversas analisadas. */
export async function listar(processoId: string, pessoa?: Pessoa | null) {
  const processo = await processoDasRegras(processoId);
  if (!(await bancoTemRegras())) return { disponivel: false as const, regras: [], confirmador: null, pode_confirmar: false, pops: [], fontes: [] };
  const db = supabase();
  const [rs, es, pops] = await Promise.all([
    db.from('regras').select(CAMPOS).eq('tenant_id', TENANT_PADRAO).eq('processo_id', processoId).in('situacao', ['sugerida', 'confirmada']).order('criado_em'),
    db.from('entrevistas').select('id, status, entrevistado_id, iniciada_em, criado_em, metricas').eq('tenant_id', TENANT_PADRAO).eq('processo_id', processoId).eq('finalidade', 'regras').is('arquivado_em', null).order('criado_em', { ascending: false }),
    popsDoProcesso(processoId),
  ]);
  for (const r of [rs, es]) if (r.error) throw r.error;
  const linhas = (rs.data ?? []) as Linha[];
  const entrevistas = (es.data ?? []) as { id: string; status: string; entrevistado_id: string | null; iniciada_em: string | null; criado_em: string; metricas: { duracao_s?: number } | null }[];
  // Quantas sugestões cada conversa rendeu (inclusive as já confirmadas ou descartadas).
  const { data: contagem, error: e3 } = await db.from('regras').select('entrevista_id').eq('tenant_id', TENANT_PADRAO).eq('processo_id', processoId).eq('origem', 'maia');
  if (e3) throw e3;
  const porEntrevista = new Map<string, number>();
  for (const c of (contagem ?? []) as { entrevista_id: string | null }[]) if (c.entrevista_id) porEntrevista.set(c.entrevista_id, (porEntrevista.get(c.entrevista_id) ?? 0) + 1);
  const quem = await nomes([processo.confirmador_regras_id, ...entrevistas.map((e) => e.entrevistado_id), ...linhas.flatMap((l) => [l.criado_por, l.confirmada_por])]);
  // As conversas citadas pelas regras podem estar arquivadas ou ser de outra finalidade: busca o nome de quem falou.
  const idsEntrevistas = [...new Set(linhas.flatMap((l) => [l.entrevista_id, l.esclarecimento_entrevista_id]).filter((x): x is string => !!x))];
  const donos = new Map<string, string | null>(entrevistas.map((e) => [e.id, e.entrevistado_id]));
  const faltam = idsEntrevistas.filter((id) => !donos.has(id));
  if (faltam.length) {
    const { data } = await db.from('entrevistas').select('id, entrevistado_id').in('id', faltam);
    for (const e of (data ?? []) as { id: string; entrevistado_id: string | null }[]) donos.set(e.id, e.entrevistado_id);
    const mais = await nomes([...donos.values()]);
    for (const [k, v] of mais) quem.set(k, v);
  }
  const entrevistado = (id: string | null) => (id ? quem.get(donos.get(id) ?? '') ?? null : null);
  const porId = new Map(linhas.map((l) => [l.id, l]));
  const popPorId = new Map(pops.map((p) => [p.id, p]));
  return {
    disponivel: true as const,
    confirmador: processo.confirmador_regras_id ? { id: processo.confirmador_regras_id, nome: quem.get(processo.confirmador_regras_id) ?? 'Pessoa não encontrada' } : null,
    pode_confirmar: podeConfirmar(pessoa, processo) && !processo.arquivado_em,
    pops: pops.map((p) => ({ id: p.id, rotulo: rotuloDoPop(p) })),
    fontes: entrevistas.map((e) => ({ id: e.id, status: e.status, entrevistado: quem.get(e.entrevistado_id ?? '') ?? null, quando: e.iniciada_em ?? e.criado_em, duracao_s: e.metricas?.duracao_s ?? 0, sugestoes: porEntrevista.get(e.id) ?? 0 })),
    regras: linhas.map((l) => {
      const conflitante = l.conflito_regra_id ? porId.get(l.conflito_regra_id) : null;
      const pop = l.pop_id ? popPorId.get(l.pop_id) : null;
      return {
        id: l.id, tipo: l.tipo, texto: l.texto, situacao: l.situacao, codigo: codigoDaRegra(l.tipo, l.numero), origem: l.origem,
        pop: pop ? { id: pop.id, rotulo: rotuloDoPop(pop) } : null,
        entrevista: l.entrevista_id ? { id: l.entrevista_id, entrevistado: entrevistado(l.entrevista_id) } : null,
        trecho: l.trecho, trecho_ms: l.trecho_ms,
        // O conflito só vale enquanto a outra regra está confirmada.
        conflito: l.conflito && (!l.conflito_regra_id || conflitante?.situacao === 'confirmada') ? { codigo: conflitante ? codigoDaRegra(conflitante.tipo, conflitante.numero) : '', texto: l.conflito } : null,
        perguntar: !!l.perguntar_em,
        esclarecimento: l.esclarecimento ? { texto: l.esclarecimento, de: entrevistado(l.esclarecimento_entrevista_id) } : null,
        criado_por: quem.get(l.criado_por ?? '') ?? null, confirmada_por: quem.get(l.confirmada_por ?? '') ?? null, confirmada_em: l.confirmada_em, criado_em: l.criado_em,
      };
    }),
  };
}

// --- Escolher quem confirma (gestores e administradores; a rota confere) ---

export const ConfirmadorSchema = z.object({ pessoa: z.string().regex(UUID, 'Pessoa inválida.').nullable() });

export async function definirConfirmador(processoId: string, d: z.infer<typeof ConfirmadorSchema>) {
  await exigirBanco();
  const processo = await processoDasRegras(processoId);
  if (processo.arquivado_em) throw new ErroApi(409, 'Este processo está arquivado.');
  if (d.pessoa) {
    const { data, error } = await supabase().from('pessoas').select('id').eq('id', d.pessoa).maybeSingle();
    if (error) throw error;
    if (!data) throw new ErroApi(404, 'A pessoa escolhida não está mais cadastrada.');
  }
  const { error } = await supabase().from('processos').update({ confirmador_regras_id: d.pessoa }).eq('tenant_id', TENANT_PADRAO).eq('id', processoId);
  if (error) throw error;
  return { ok: true as const };
}

// --- Criar, editar, confirmar, descartar, arquivar ---

const Texto = z.string().trim().min(3, 'Escreva a regra.').max(600, 'A regra pode ter até 600 caracteres.');
const Tipo = z.enum(['negocio', 'comportamento']);
const PopId = z.string().regex(UUID, 'POP inválido.').nullable();
export const NovaRegraSchema = z.object({ texto: Texto, tipo: Tipo, pop_id: PopId.optional() });
export const AlteracaoSchema = z.object({
  texto: Texto.optional(), tipo: Tipo.optional(), pop_id: PopId.optional(),
  acao: z.enum(['confirmar', 'descartar', 'arquivar', 'perguntar', 'nao_perguntar']).optional(),
});

async function conferirPop(processoId: string, popId: string | null | undefined) {
  if (!popId) return null;
  const { data, error } = await supabase().from('pops').select('id').eq('tenant_id', TENANT_PADRAO).eq('processo_id', processoId).eq('id', popId).maybeSingle();
  if (error) throw error;
  if (!data) throw new ErroApi(400, 'Esse POP não é deste processo.');
  return popId;
}

/** O próximo número do tipo no processo. Dois confirmando ao mesmo tempo: o índice único recusa e a chamada tenta de novo. */
async function proximoNumero(processoId: string, tipo: TipoRegra) {
  const { data, error } = await supabase().from('regras').select('numero').eq('tenant_id', TENANT_PADRAO).eq('processo_id', processoId).eq('tipo', tipo).not('numero', 'is', null).order('numero', { ascending: false }).limit(1);
  if (error) throw error;
  return (((data ?? [])[0] as { numero: number } | undefined)?.numero ?? 0) + 1;
}
async function comNumero<T>(processoId: string, tipo: TipoRegra, gravar: (numero: number) => PromiseLike<{ data: T | null; error: { code?: string; message: string } | null }>) {
  for (let tentativa = 0; ; tentativa++) {
    const { data, error } = await gravar(await proximoNumero(processoId, tipo));
    if (!error) return data;
    if (error.code !== '23505' || tentativa >= 3) throw error;
  }
}

/** Regra escrita à mão por quem confirma: já nasce confirmada, com código. */
export async function criar(processoId: string, d: z.infer<typeof NovaRegraSchema>, pessoa?: Pessoa | null) {
  await exigirBanco();
  const processo = await processoDasRegras(processoId);
  exigirConfirmador(pessoa, processo);
  const pop_id = await conferirPop(processoId, d.pop_id);
  const data = await comNumero(processoId, d.tipo, (numero) => supabase().from('regras')
    .insert({ tenant_id: TENANT_PADRAO, processo_id: processoId, tipo: d.tipo, texto: d.texto, situacao: 'confirmada', numero, pop_id, origem: 'manual', criado_por: pessoa?.id ?? null, confirmada_por: pessoa?.id ?? null, confirmada_em: agora() })
    .select('id, numero').single());
  const r = data as unknown as { id: string; numero: number };
  return { id: r.id, codigo: codigoDaRegra(d.tipo, r.numero) };
}

/** Edita o texto, o tipo ou a que se aplica, e muda a situação (confirmar, descartar, arquivar, perguntar na próxima entrevista). */
export async function alterar(id: string, d: z.infer<typeof AlteracaoSchema>, pessoa?: Pessoa | null) {
  await exigirBanco();
  const regra = await carregar(id);
  const processo = await processoDasRegras(regra.processo_id);
  exigirConfirmador(pessoa, processo);
  if (regra.situacao === 'descartada' || regra.situacao === 'arquivada') throw new ErroApi(409, 'Esta regra não está mais na lista.');
  const dados: Partial<Linha> = { atualizado_em: agora() };
  if (d.texto !== undefined) dados.texto = d.texto;
  if (d.pop_id !== undefined) dados.pop_id = await conferirPop(regra.processo_id, d.pop_id);
  const tipo = d.tipo ?? regra.tipo;
  if (d.tipo !== undefined) dados.tipo = d.tipo;
  const db = supabase();
  const gravar = (extra: Partial<Linha> = {}) => db.from('regras').update({ ...dados, ...extra }).eq('tenant_id', TENANT_PADRAO).eq('id', id).select('id, numero').single();
  let numero = regra.numero;
  if (d.acao === 'confirmar') {
    if (regra.situacao === 'confirmada') throw new ErroApi(409, 'Esta regra já está confirmada.');
    const r = await comNumero(regra.processo_id, tipo, (n) => gravar({ situacao: 'confirmada', numero: n, confirmada_por: pessoa?.id ?? null, confirmada_em: agora(), perguntar_em: null }));
    numero = (r as { numero: number }).numero;
  } else if (d.acao === 'descartar') {
    if (regra.situacao !== 'sugerida') throw new ErroApi(409, 'Só uma regra sugerida pode ser descartada. Para tirar uma regra confirmada, arquive.');
    const { error } = await gravar({ situacao: 'descartada', perguntar_em: null });
    if (error) throw error;
  } else if (d.acao === 'arquivar') {
    if (regra.situacao !== 'confirmada') throw new ErroApi(409, 'Só uma regra confirmada pode ser arquivada.');
    const { error } = await gravar({ situacao: 'arquivada' });
    if (error) throw error;
  } else if (d.acao === 'perguntar' || d.acao === 'nao_perguntar') {
    if (regra.situacao !== 'sugerida') throw new ErroApi(409, 'Só uma regra em revisão vai para a próxima entrevista.');
    const { error } = await gravar({ perguntar_em: d.acao === 'perguntar' ? agora() : null });
    if (error) throw error;
  } else if (regra.situacao === 'confirmada' && d.tipo !== undefined && d.tipo !== regra.tipo) {
    // Mudou de tipo depois de confirmada: ganha o próximo número do tipo novo (o antigo não é reaproveitado).
    const r = await comNumero(regra.processo_id, tipo, (n) => gravar({ numero: n }));
    numero = (r as { numero: number }).numero;
  } else {
    const { error } = await gravar();
    if (error) throw error;
  }
  return { ok: true as const, codigo: codigoDaRegra(tipo, d.acao === 'confirmar' || regra.situacao === 'confirmada' ? numero : null) };
}

/** A conversa e o ponto da fala de onde a regra saiu, para ouvir o trecho. */
export async function trechoDaRegra(id: string) {
  await exigirBanco();
  const regra = await carregar(id);
  if (!regra.entrevista_id || regra.trecho_ms === null) throw new ErroApi(404, 'Esta regra não tem um trecho de conversa para ouvir.');
  return { entrevista_id: regra.entrevista_id, ms: regra.trecho_ms };
}

/** As regras à espera de revisão de quem está logado (aviso do Início): os processos em que a pessoa confirma; administradores veem todos. */
export async function paraRevisar(pessoa?: Pessoa | null) {
  if (!(await bancoTemRegras())) return [];
  const { data, error } = await supabase().from('regras').select('processo_id, processo:processos(id, nome, arquivado_em, confirmador_regras_id)').eq('tenant_id', TENANT_PADRAO).eq('situacao', 'sugerida');
  if (error) throw error;
  const porProcesso = new Map<string, { id: string; nome: string; sugeridas: number }>();
  for (const l of (data ?? []) as unknown as { processo: ProcessoDasRegras | null }[]) {
    const p = l.processo;
    if (!p || p.arquivado_em) continue;
    if (pessoa && pessoa.nivel !== 'admin' && p.confirmador_regras_id !== pessoa.id) continue;
    const x = porProcesso.get(p.id) ?? { id: p.id, nome: p.nome, sugeridas: 0 };
    x.sugeridas++;
    porProcesso.set(p.id, x);
  }
  return [...porProcesso.values()].sort((a, b) => b.sugeridas - a.sugeridas);
}

// --- O que a Maia leva para a entrevista de regras e o que a análise devolve ---

export type RegrasParaAMaia = {
  confirmadas: { id: string; codigo: string; texto: string }[];
  /** As dúvidas marcadas com "Perguntar na próxima entrevista". */
  duvidas: { id: string; texto: string; conflito: string }[];
};

/** As regras já confirmadas do processo e as dúvidas a esclarecer, para a Maia e para a análise. */
export async function regrasParaAMaia(processoId: string): Promise<RegrasParaAMaia> {
  const { data, error } = await supabase().from('regras').select(CAMPOS).eq('tenant_id', TENANT_PADRAO).eq('processo_id', processoId).in('situacao', ['sugerida', 'confirmada']).order('criado_em');
  if (error) throw error;
  const linhas = (data ?? []) as Linha[];
  const porId = new Map(linhas.map((l) => [l.id, l]));
  return {
    confirmadas: linhas.filter((l) => l.situacao === 'confirmada').slice(0, 60).map((l) => ({ id: l.id, codigo: codigoDaRegra(l.tipo, l.numero), texto: l.texto })),
    duvidas: linhas.filter((l) => l.situacao === 'sugerida' && l.perguntar_em).slice(0, 10).map((l) => {
      const outra = l.conflito_regra_id ? porId.get(l.conflito_regra_id) : null;
      return { id: l.id, texto: l.texto, conflito: [outra && `Outra regra do processo diz: "${outra.texto}"`, l.conflito].filter(Boolean).join(' ') };
    }),
  };
}

export const AnaliseRegrasSchema = z.object({
  entrevistado: z.object({
    area: z.string().describe('A área ou o setor da pessoa entrevistada, como ela disse; vazio se ela não disse'),
    funcao: z.string().describe('O que ela faz: o cargo e as atividades do dia a dia, em uma frase curta; vazio se ela não disse'),
  }),
  resumo: z.string().describe('Um parágrafo em HTML simples (<p>): do que a conversa tratou e que assuntos de regra apareceram'),
  regras: z.array(z.object({
    texto: z.string().describe('A regra em uma frase afirmativa, no presente, que se entende sem a conversa'),
    tipo: z.enum(['negocio', 'comportamento']),
    fala: z.number().int().describe('O número (#) da fala do entrevistado de onde a regra saiu'),
    trecho: z.string().describe('A parte da fala que sustenta a regra, como foi dita, até 300 caracteres'),
    pop: z.number().int().describe('O número do POP em <pops> a que a regra se aplica; 0 para o processo inteiro'),
    conflito_com: z.string().describe('O código da regra confirmada com que pode conflitar (ex.: "RN-01"); vazio se não há conflito'),
    conflito: z.string().describe('Em uma ou duas frases, o que não bate e o que vale confirmar; vazio se não há conflito'),
  })),
  esclarecimentos: z.array(z.object({
    numero: z.number().int().describe('O número da dúvida em <duvidas>'),
    resposta: z.string().describe('O que a pessoa respondeu sobre a dúvida, em uma ou duas frases'),
    trecho: z.string().describe('A fala dela, como foi dita, até 300 caracteres'),
  })).describe('Só as dúvidas de <duvidas> que a pessoa respondeu; vazio se não há o bloco'),
  pendencias: z.array(z.string()).describe(`Perguntas que a própria pessoa pode responder numa próxima conversa, no máximo ${MAX_PENDENCIAS}`),
  pendencias_outra_pessoa: z.array(z.object({ pergunta: z.string(), quem_sabe: z.string() })),
  situacao_pendencias: z.array(z.object({
    numero: z.number().int(),
    situacao: z.enum(['respondida', 'em_aberto', 'outra_pessoa']),
    quem_sabe: z.string(),
  })).describe('Uma entrada para cada pendência de <pendencias_anteriores>; vazio se não há o bloco'),
});
export type AnaliseRegras = z.infer<typeof AnaliseRegrasSchema>;

export const SISTEMA_REGRAS = `Você é especialista em regras de negócio. Recebe a transcrição de uma entrevista por voz em que uma entrevistadora (IA) conversou com uma pessoa para levantar as regras que valem em um processo de trabalho. A transcrição veio de reconhecimento de voz: corrija nomes e termos pelo contexto, mas não invente nada que não foi dito. A conversa foi ao vivo e os dois podiam falar ao mesmo tempo: falas marcadas "falou junto com o entrevistador" foram ditas por cima da fala dela e costumam ser correções, que valem mais que o que foi dito antes. Cada fala do entrevistado vem com um número (#).

O que é uma regra: uma afirmação que restringe ou orienta o trabalho e que alguém pode cumprir ou descumprir. É uma condição ("só entra no sorteio o cupom recebido até o fechamento da urna"), um limite ou uma alçada, um prazo, uma obrigação, uma proibição, um cálculo, ou uma exceção com quem a autoriza. Etapa do processo não é regra: "o apoio leva a urna ao palco" é etapa; "a urna só vai ao palco lacrada" é regra.

Produza, em português do Brasil:
1. "regras": cada regra que a pessoa afirmou ou confirmou, uma por item.
   - "texto": uma frase só, afirmativa, no presente, que se entende sem a conversa, com o valor, o prazo ou a condição que a pessoa disse. Sem "o entrevistado disse". Uma regra por frase: se a fala traz duas regras, são dois itens. Mas o que completa uma regra fica nela, não vira item à parte: quem autoriza, quem aprova ou a quem se aplica entra na mesma frase ("um projeto estratégico só começa depois do aval do CEO", e não uma regra para "precisa de validação" e outra para "o CEO dá o aval").
   - "tipo": "negocio" para o que a empresa exige (condições, prazos, limites, alçadas, cálculos, obrigações e proibições do negócio), inclusive o que um cargo pode ou não pode decidir; "comportamento" para como as pessoas devem agir ao executar (postura, comunicação, cuidado, sigilo, quem fala o quê e quando).
   - "fala": o número (#) da fala do entrevistado de onde a regra saiu, a mais direta.
   - "trecho": a parte dessa fala que sustenta a regra, com as palavras da pessoa, até 300 caracteres. Pode cortar o começo e o fim. Tire as hesitações e repetições ("eh", "é...", "né", sílabas repetidas como "proje- projeto") e corrija erros evidentes do reconhecimento de voz, sem trocar nem acrescentar palavras.
   - "pop": o número do POP em <pops> a que a regra se aplica, só quando a regra fala do que aquele POP faz (o assunto dela aparece no nome ou no objetivo do POP); 0 quando vale para o processo inteiro, quando não há <pops> ou quando há qualquer dúvida.
   - "conflito_com" e "conflito": se a regra contradiz, ou pode contradizer, uma regra de <regras_confirmadas>, o código dela (por exemplo, "RN-01") e, em uma ou duas frases, o que não bate e o que vale confirmar. Sem conflito, os dois vazios. Detalhar ou complementar uma regra confirmada não é conflito.
   Fidelidade: só entra o que a pessoa disse ou confirmou. Um "isso" ou "exato" depois que a entrevistadora repetiu a regra vale como confirmação; nesse caso, "fala" e "trecho" são da fala em que a pessoa explicou a regra, se houver, ou da confirmação. Não tire regra do bloco <processo> nem de conhecimento geral. Hipótese, opinião ("eu acho que deveria ser") e dificuldade não são regra. A falta de regra também não é regra: "não tem prazo", "não tem formato obrigatório" não entra (só responde a pergunta). Recomendação ("o ideal é", "o melhor é", "costuma ser") também não entra, a não ser que a pessoa diga que é exigido. Regra vaga, sem o valor ou a condição ("tem um prazo para isso"), não entra: vira pendência. O que foi dito depois corrige o que foi dito antes: vale a versão mais recente.
   Sem repetir: não sugira de novo o que já está, com o mesmo sentido, em <regras_confirmadas>, <sugestoes_em_revisao> ou <regras_descartadas>. Se a pessoa disse algo diferente de uma regra confirmada, sugira a regra como ela disse e aponte o conflito.
2. "esclarecimentos": só quando vier o bloco <duvidas> (pontos que a entrevistadora ficou de esclarecer nesta conversa). Para cada dúvida que a pessoa respondeu: o número, a resposta em uma ou duas frases e o trecho da fala. Dúvida sem resposta não entra. A resposta a uma dúvida não vira regra nova em "regras", a não ser que traga uma regra diferente da que está na dúvida.
3. "resumo": um parágrafo em HTML simples (só <p>, <strong>, <em>): do que a conversa tratou e que assuntos de regra apareceram. Tom de documento.
4. "pendencias": o que faz falta para fechar uma regra e que a própria pessoa pode responder, escrito como perguntas para uma próxima conversa com ela (vazio se nada). No máximo ${MAX_PENDENCIAS}, as mais importantes primeiro. Entra: regra citada sem o valor, o prazo ou a condição; exceção citada sem quem autoriza. Não entra: como uma tarefa é feita (formato, canal, ferramenta, antecedência), a não ser que a pessoa tenha dito que existe regra sobre isso. Pergunta respondida está fechada, mesmo que a resposta seja curta ou negativa. Curiosidade não é pendência.
   "pendencias_outra_pessoa": o que a pessoa disse não saber ou ser de outra área: a pergunta e "quem_sabe" (a área ou o cargo que saberia responder). O que vai para uma lista não vai para a outra.
5. "entrevistado": a área ou o setor da pessoa e o que ela faz, só com o que ela contou sobre si na conversa ou com o que vier no bloco <pessoa>. O que ela não disse fica vazio.
A conversa pode ter uma continuação, em que a pessoa voltou para responder pontos em aberto. Nesse caso vem o bloco <pendencias_anteriores>: preencha "situacao_pendencias" com a situação de cada uma (respondida: a pessoa respondeu, mesmo em poucas palavras; outra_pessoa: disse não saber ou ser de outra área, com "quem_sabe"; em_aberto: não houve resposta) e deixe "pendencias" vazio. Sem o bloco, "situacao_pendencias" fica vazio.
Ruído: ignore falas soltas sem ligação com o assunto (outra conversa perto do microfone, frase cortada), saudações e desvios. O nome da empresa se escreve INC (na transcrição pode aparecer "Ínqui", que é como se fala): escreva sempre INC. O que a entrevistadora explicou por conta própria é conhecimento geral: serve para entender a conversa, não é regra do processo.`;

/** O que a análise precisa saber do processo, além da conversa. */
export type ContextoDaAnalise = {
  confirmadas: { id: string; codigo: string; texto: string }[];
  emRevisao: string[]; // sugestões de outras conversas, ainda sem confirmação
  descartadas: string[];
  pops: { id: string; rotulo: string; objetivo: string }[];
  duvidas: { id: string; texto: string; conflito: string }[];
};

/** Lê do banco o contexto da análise. As sugestões ainda em revisão desta mesma conversa ficam de fora (elas serão refeitas). */
export async function contextoDaAnalise(processoId: string, entrevistaId: string): Promise<ContextoDaAnalise> {
  const [{ data, error }, pops, paraMaia] = await Promise.all([
    supabase().from('regras').select('id, texto, situacao, entrevista_id').eq('tenant_id', TENANT_PADRAO).eq('processo_id', processoId).in('situacao', ['sugerida', 'descartada']).order('criado_em'),
    popsDoProcesso(processoId, true),
    regrasParaAMaia(processoId),
  ]);
  if (error) throw error;
  const linhas = (data ?? []) as { id: string; texto: string; situacao: SituacaoRegra; entrevista_id: string | null }[];
  return {
    confirmadas: paraMaia.confirmadas,
    emRevisao: linhas.filter((l) => l.situacao === 'sugerida' && l.entrevista_id !== entrevistaId).map((l) => l.texto).slice(0, 60),
    descartadas: linhas.filter((l) => l.situacao === 'descartada').map((l) => l.texto).slice(-40),
    pops: pops.map((p) => ({ id: p.id, rotulo: rotuloDoPop(p), objetivo: typeof p.objetivo === 'string' ? textoPuro(p.objetivo).replace(/\s+/g, ' ').trim().slice(0, 300) : '' })),
    duvidas: paraMaia.duvidas,
  };
}

const lista = (itens: string[]) => itens.map((x, i) => `${i + 1}. ${x}`).join('\n');

/** O pedido da análise de regras: o processo, o que já existe de regra, as dúvidas e a conversa com as falas numeradas. */
export function montarPedidoRegras(l: { tema: string; contexto: string; turnos: Turno[] }, c: ContextoDaAnalise, perfil?: PerfilEntrevistado | null, anteriores?: { pendencias: string[]; escolhidas: string[] } | null) {
  const blocos = [
    `<processo>\nTema da entrevista: ${l.tema}\n${l.contexto ? `Contexto: ${l.contexto}\n` : ''}</processo>`,
    perfil && `<pessoa>\n${[perfil.area && `Área: ${perfil.area}`, perfil.funcao && `O que faz: ${perfil.funcao}`].filter(Boolean).join('\n')}\n</pessoa>`,
    c.pops.length > 0 && `<pops>\nOs procedimentos (POPs) deste processo, para dizer a qual a regra se aplica:\n${lista(c.pops.map((p) => `${p.rotulo}${p.objetivo ? `: ${p.objetivo}` : ''}`))}\n</pops>`,
    c.confirmadas.length > 0 && `<regras_confirmadas>\n${c.confirmadas.map((r) => `${r.codigo}: ${r.texto}`).join('\n')}\n</regras_confirmadas>`,
    c.emRevisao.length > 0 && `<sugestoes_em_revisao>\nSugeridas em outras conversas, ainda sem confirmação:\n${lista(c.emRevisao)}\n</sugestoes_em_revisao>`,
    c.descartadas.length > 0 && `<regras_descartadas>\nJá sugeridas e descartadas por quem revisa:\n${lista(c.descartadas)}\n</regras_descartadas>`,
    c.duvidas.length > 0 && `<duvidas>\nPontos que a entrevistadora ficou de esclarecer nesta conversa:\n${lista(c.duvidas.map((d) => `${d.texto}${d.conflito ? ` (dúvida: ${d.conflito})` : ''}`))}\n</duvidas>`,
    `<entrevista>\n${transcricaoNumerada(l.turnos)}\n</entrevista>`,
    anteriores?.pendencias.length && `<pendencias_anteriores>\nA pessoa voltou à conversa para responder pontos em aberto. Estas eram as pendências; as marcadas com (escolhida) são as que ela veio responder.\n${anteriores.pendencias.map((p, i) => `${i + 1}. ${p}${anteriores.escolhidas.includes(p) ? ' (escolhida)' : ''}`).join('\n')}\n</pendencias_anteriores>`,
  ];
  return blocos.filter(Boolean).join('\n\n');
}

const semAcento = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

/**
 * Transforma o que a análise devolveu nas linhas a gravar: liga cada regra à fala (o tempo dela na conversa), ao
 * POP e à regra com que conflita. Função pura, para testar sem banco.
 */
export function sugestoesDaAnalise(a: Pick<AnaliseRegras, 'regras'>, turnos: Turno[], c: Pick<ContextoDaAnalise, 'confirmadas' | 'pops'>) {
  const porCodigo = new Map(c.confirmadas.map((r) => [r.codigo.toUpperCase(), r.id]));
  const vistos = new Set<string>();
  const saida: { tipo: TipoRegra; texto: string; trecho: string; trecho_ms: number | null; pop_id: string | null; conflito_regra_id: string | null; conflito: string }[] = [];
  for (const r of a.regras) {
    const texto = r.texto.replace(/\s+/g, ' ').trim().slice(0, 600);
    const chave = semAcento(texto);
    if (texto.length < 3 || vistos.has(chave)) continue;
    vistos.add(chave);
    const fala = turnos[r.fala];
    const conflito_regra_id = porCodigo.get(r.conflito_com.trim().toUpperCase()) ?? null;
    const conflito = r.conflito.replace(/\s+/g, ' ').trim().slice(0, 600);
    saida.push({
      tipo: r.tipo, texto,
      trecho: r.trecho.replace(/\s+/g, ' ').trim().replace(/^["“]+|["”]+$/g, '').slice(0, 400),
      trecho_ms: fala && fala.quem === 'pessoa' && typeof fala.inicio_ms === 'number' ? Math.max(0, Math.round(fala.inicio_ms)) : null,
      pop_id: c.pops[r.pop - 1]?.id ?? null,
      // Conflito só com explicação; e só aponta para uma regra que existe.
      conflito_regra_id: conflito ? conflito_regra_id : null,
      conflito: conflito && (conflito_regra_id || !r.conflito_com.trim()) ? conflito : '',
    });
  }
  return saida;
}

/**
 * Guarda o que a análise de uma entrevista de regras encontrou: troca as sugestões ainda em revisão desta conversa
 * pelas novas (a análise pode rodar de novo quando a pessoa volta para completar) e anota os esclarecimentos nas
 * dúvidas que foram perguntadas. Devolve quantas regras foram sugeridas.
 */
export async function guardarSugestoes(entrevista: { id: string; processo_id: string; turnos: Turno[] }, a: AnaliseRegras, c: ContextoDaAnalise) {
  const db = supabase();
  const { error: e1 } = await db.from('regras').delete().eq('tenant_id', TENANT_PADRAO).eq('entrevista_id', entrevista.id).eq('situacao', 'sugerida');
  if (e1) throw e1;
  const novas = sugestoesDaAnalise(a, entrevista.turnos, c);
  if (novas.length) {
    const { error } = await db.from('regras').insert(novas.map((n) => ({ ...n, tenant_id: TENANT_PADRAO, processo_id: entrevista.processo_id, situacao: 'sugerida', origem: 'maia', entrevista_id: entrevista.id })));
    if (error) throw error;
  }
  for (const e of a.esclarecimentos ?? []) {
    const duvida = c.duvidas[e.numero - 1];
    const resposta = e.resposta.replace(/\s+/g, ' ').trim();
    if (!duvida || !resposta) continue;
    const trecho = e.trecho.replace(/\s+/g, ' ').trim().slice(0, 300);
    const { error } = await db.from('regras').update({ esclarecimento: `${resposta}${trecho ? ` “${trecho}”` : ''}`.slice(0, 900), esclarecimento_entrevista_id: entrevista.id, perguntar_em: null, atualizado_em: agora() })
      .eq('tenant_id', TENANT_PADRAO).eq('id', duvida.id).eq('situacao', 'sugerida');
    if (error) throw error;
  }
  return novas.length;
}
