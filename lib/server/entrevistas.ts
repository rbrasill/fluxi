import 'server-only';
import { z } from 'zod';
import { LIMITES_ENTREVISTA, MAX_CONVITES, MAX_PENDENCIAS, PRECO_VOZ_USD_MIN, TOPICOS, limparMarcasDeSom, resumoMetricas, transcricaoDaConversa, type Complemento, type Metricas, type PerfilEntrevistado, type ResultadoEntrevista, type StatusEntrevista, type Turno } from '@/lib/entrevista/topicos';
import { lerTexto, paraHtml, textoPuro } from '@/lib/pop/texto-rico';
import { carteiroConfigurado, enviarEmail } from './carteiro';
import { ErroApi } from './http';
import { chamarEstruturado, type UsoIa } from './ia';
import { emProducao, type Pessoa } from './login';
import { TENANT_PADRAO, supabase } from './supabase';

// Entrevista por voz com a Maia, só com o GPT-Live da OpenAI (decisão 41). Nasce dentro do processo, por
// convite, uma por pessoa, e só a pessoa convidada conversa com ela (decisões 49 e 53).
// O navegador fala direto com o GPT-Live por WebRTC (áudio nos dois sentidos ao mesmo tempo: full duplex);
// o servidor só abre a sessão (com a chave da OpenAI, que não vai para o navegador) e guarda o que volta:
// a conversa transcrita, as métricas e a gravação. A condução da entrevista está nas instruções da sessão.
// Quando a conversa termina, o Claude lê a conversa inteira e escreve a descrição, a ficha e as pendências.

const BUCKET = 'gravacoes';
const MODELO_VOZ = process.env.INCFLOW_MODELO_VOZ || 'gpt-live-1'; // US$ 0,05 por minuto de sessão
const VOZ = process.env.INCFLOW_VOZ_ENTREVISTA || 'bossa'; // vozes em português do Brasil: bossa e tempo
const MODELO_ANALISE = process.env.INCFLOW_MODELO_ANALISE || 'claude-sonnet-5-5';
const MODELO_CONSULTA = process.env.INCFLOW_MODELO_CONSULTA || 'claude-sonnet-5-5'; // o mesmo da análise: mais assertivo (decisão 59)
const URL_SESSOES = process.env.INCFLOW_LIVE_URL || 'https://api.openai.com/v1/live/sessions';
/** A expressão da despedida: quando a IA a diz (e termina de falar), o app encerra a entrevista sozinho. */
export const FRASE_FINAL = 'Vamos concluir por aqui';
/** A expressão de pausa: a IA a diz quando a pessoa precisa sair; o app desliga a sessão e a entrevista fica aberta para continuar. */
export const FRASE_PAUSA = 'A gente continua depois';
// Quem é a entrevistadora (fase de teste, decisões 45 e 48): nome e com quem trabalha, ditos na abertura.
const NOME_IA = 'Maia';
const COM_QUEM = 'com o Rafael Brasil, na área de processos da Ínqui';
// A empresa se escreve INC e se fala "Ínqui". O modelo de voz fala do jeito que lê: nas instruções e no
// histórico, o nome vai escrito como se fala (com "INC" escrito, ela soletrava ou lia em inglês).
export const comoSeFala = (s: string) => s.replace(/\bINC\b/g, 'Ínqui');

export type Linha = {
  id: string; processo_id: string | null; tema: string; contexto: string; motor: string; status: StatusEntrevista;
  turnos: Turno[]; sessoes: string[]; metricas: Metricas;
  resultado: ResultadoEntrevista | null; erro: string | null; audio_caminho: string | null;
  entrevistado_id: string | null; // a pessoa convidada (sem convite, em desenvolvimento: quem abriu a primeira sessão)
  convidado_por: string | null; convidado_em: string | null; nota_convite: string; convite_enviado_em: string | null; iniciada_em: string | null; em_ligacao_ate: string | null;
  complemento: Complemento | null; // voltar para fechar pontos em aberto (decisão 56)
  criado_em: string; encerrado_em: string | null; atualizado_em: string;
};
const CAMPOS = 'id, processo_id, tema, contexto, motor, status, turnos, sessoes, metricas, resultado, erro, audio_caminho, entrevistado_id, convidado_por, convidado_em, nota_convite, convite_enviado_em, iniciada_em, em_ligacao_ate, complemento, criado_em, encerrado_em, atualizado_em';
/** O complemento ainda por fazer (escolhido e não concluído). */
const complementoAberto = (l: Pick<Linha, 'complemento'>) => (l.complemento && !l.complemento.concluido_em ? l.complemento : null);
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

// --- Convites (decisão 53): a entrevista nasce dentro do processo, uma por pessoa, até três por vez ---

export const ConviteSchema = z.object({
  pessoas: z.array(z.string().regex(UUID, 'Pessoa inválida.')).min(1, 'Escolha ao menos uma pessoa.').max(MAX_CONVITES, `Convide até ${MAX_CONVITES} pessoas por vez.`),
  nota: z.string().trim().max(500, 'A nota pode ter até 500 caracteres.').optional(),
});

type ProcessoDoConvite = { id: string; nome: string; descricao: string | null; arquivado_em: string | null; area: { id: string; nome: string; organizacao: { id: string; nome: string } | null } | null };
const CAMPOS_PROCESSO = 'id, nome, descricao, arquivado_em, area:areas(id, nome, organizacao:organizacoes(id, nome))';

async function processoDoConvite(id: string) {
  if (!UUID.test(id)) throw new ErroApi(404, 'Processo não encontrado');
  const { data, error } = await supabase().from('processos').select(CAMPOS_PROCESSO).eq('tenant_id', TENANT_PADRAO).eq('id', id).maybeSingle();
  if (error) throw error;
  if (!data) throw new ErroApi(404, 'Processo não encontrado');
  return data as unknown as ProcessoDoConvite;
}

/** O contexto que a Maia lê antes de falar: organização e área, a descrição do processo e o pedido de quem convidou. */
export function contextoDoConvite(p: ProcessoDoConvite, nota: string) {
  const partes: string[] = [];
  const onde = [p.area?.organizacao?.nome, p.area?.nome].filter(Boolean).join(', área ');
  if (onde) partes.push(`Organização e área: ${onde}.`);
  const descricao = textoPuro(p.descricao ?? '').replace(/\s+/g, ' ').trim();
  if (descricao) partes.push(`Descrição do processo no cadastro: ${descricao.slice(0, 1500)}`);
  if (nota.trim()) partes.push(`Pedido de quem convidou: ${nota.trim()}`);
  return partes.join('\n');
}

const linkDaEntrevista = (origem: string, id: string) => `${origem.replace(/\/$/, '')}/app/entrevistas/${id}`;

/** Manda o e-mail do convite. Se o carteiro falhar, o convite fica sem `convite_enviado_em` (dá para reenviar). */
async function enviarConvite(linha: Pick<Linha, 'id' | 'tema' | 'nota_convite'>, pessoa: { nome: string; email: string }, convidadoPor: string, origem: string) {
  try {
    await enviarEmail({ tipo: 'convite', email: pessoa.email, nome: pessoa.nome, processo: linha.tema, convidado_por: convidadoPor, link: linkDaEntrevista(origem, linha.id), nota: linha.nota_convite });
    await salvar(linha.id, { convite_enviado_em: agora() });
    return true;
  } catch (e) {
    console.error(`[convite] e-mail para ${pessoa.email} não enviado: ${e instanceof Error ? e.message : e}`);
    return false;
  }
}

const NOME_EQUIPE = 'A equipe de processos';
/** Durante a ligação o navegador salva a conversa a cada 15 s: atualizada há menos que isto, a pessoa está falando com a Maia. */
// A pessoa está na ligação com a Maia (decisão 69): o navegador dela renova o prazo a cada 15 s; três pulsos
// perdidos e a entrevista deixa de contar como "em ligação".
const EM_LIGACAO_MS = 45_000;
const prazoDaLigacao = () => new Date(Date.now() + EM_LIGACAO_MS).toISOString();
export const emLigacao = (l: { status: string; em_ligacao_ate?: string | null }) =>
  l.status === 'em_andamento' && !!l.em_ligacao_ate && new Date(l.em_ligacao_ate).getTime() > Date.now();
const MSG_EM_LIGACAO = 'A pessoa está conversando com a Maia agora. A entrevista fica disponível quando a ligação terminar.';

/**
 * Convida até três pessoas para entrevistas sobre um processo: uma entrevista por pessoa, com o tema e o
 * contexto montados do próprio processo. Quem convida é gestor ou administrador (a rota confere). Quem já
 * tem uma entrevista aberta neste processo não recebe outra. O e-mail sai pelo carteiro.
 */
export async function convidar(processoId: string, d: z.infer<typeof ConviteSchema>, quem: Pessoa | null, origem: string) {
  const processo = await processoDoConvite(processoId);
  if (processo.arquivado_em) throw new ErroApi(409, 'Este processo está arquivado.');
  const db = supabase();
  const ids = [...new Set(d.pessoas)];
  const { data: ps, error } = await db.from('pessoas').select('id, nome, email').in('id', ids);
  if (error) throw error;
  const pessoas = (ps ?? []) as { id: string; nome: string; email: string }[];
  if (pessoas.length !== ids.length) throw new ErroApi(404, 'Alguma das pessoas escolhidas não está mais cadastrada.');
  const { data: abertas, error: e2 } = await db.from('entrevistas').select('id, entrevistado_id').eq('tenant_id', TENANT_PADRAO).eq('processo_id', processo.id).in('status', ['convidada', 'em_andamento']).in('entrevistado_id', ids);
  if (e2) throw e2;
  const jaTem = new Set(((abertas ?? []) as { entrevistado_id: string }[]).map((x) => x.entrevistado_id));
  const nota = (d.nota ?? '').trim();
  const contexto = contextoDoConvite(processo, nota);
  const convidadoPor = quem?.nome ?? NOME_EQUIPE;
  // Sem o carteiro dos convites em produção, os convites nascem sem e-mail (a tela avisa; dá para reenviar depois).
  const carteiro = carteiroConfigurado('convite') || !emProducao();
  const criadas: { id: string; pessoa: string; email_enviado: boolean }[] = [];
  const repetidas: string[] = [];
  for (const pessoa of pessoas) {
    if (jaTem.has(pessoa.id)) { repetidas.push(pessoa.nome); continue; }
    const { data, error: e3 } = await db.from('entrevistas')
      .insert({ tenant_id: TENANT_PADRAO, processo_id: processo.id, tema: processo.nome, contexto, motor: 'gpt-live', status: 'convidada', turnos: [], cobertos: [], anotacoes: [], sessoes: [], metricas: {}, entrevistado_id: pessoa.id, convidado_por: quem?.id ?? null, convidado_em: agora(), nota_convite: nota })
      .select('id').single();
    if (e3) throw e3;
    const id = (data as { id: string }).id;
    const email_enviado = carteiro ? await enviarConvite({ id, tema: processo.nome, nota_convite: nota }, pessoa, convidadoPor, origem) : false;
    criadas.push({ id, pessoa: pessoa.nome, email_enviado });
  }
  return { criadas, repetidas, carteiro_configurado: carteiro };
}

/** Manda o e-mail do convite de novo (só enquanto a pessoa não começou). */
export async function reenviarConvite(id: string, quem: Pessoa | null, origem: string) {
  const linha = await carregar(id);
  if (linha.status !== 'convidada') throw new ErroApi(409, 'Esta entrevista já começou.');
  if (emProducao() && !carteiroConfigurado('convite')) throw new ErroApi(503, 'O envio de convites por e-mail ainda não está configurado (CONVITE_MAILER_URL e CONVITE_MAILER_SECRET).');
  const { data, error } = await supabase().from('pessoas').select('id, nome, email').eq('id', linha.entrevistado_id ?? '').maybeSingle();
  if (error) throw error;
  if (!data) throw new ErroApi(404, 'A pessoa convidada não está mais cadastrada.');
  const convidadoPor = (await nomesDasPessoas([linha.convidado_por])).get(linha.convidado_por ?? '') ?? quem?.nome ?? NOME_EQUIPE;
  if (!(await enviarConvite(linha, data as { nome: string; email: string }, convidadoPor, origem))) throw new ErroApi(502, 'O e-mail não pôde ser enviado. Tente de novo em instantes.');
  return { ok: true };
}

// --- Acesso (decisão 49): só a pessoa convidada conversa com a Maia; gestores e administradores gerem ---

/** Sem login (desenvolvimento), tudo liberado. */
export const ehGestor = (p: Pessoa | null | undefined) => !p || p.nivel !== 'comum';

/** Só a pessoa convidada liga, fala, consulta e grava nesta entrevista. */
export function exigirEntrevistado(linha: Pick<Linha, 'entrevistado_id'>, pessoa: Pessoa | null | undefined) {
  if (!pessoa) return;
  if (linha.entrevistado_id && linha.entrevistado_id !== pessoa.id) throw new ErroApi(403, 'Esta entrevista é de outra pessoa: só quem foi convidado conversa com a Maia.', 'outra_pessoa');
}

// --- Voltar para fechar pontos em aberto (decisão 56) ---

export const RetomarSchema = z.object({ pendencias: z.array(z.string().trim().min(1).max(500)).min(1, 'Escolha ao menos um ponto.').max(20) });

/**
 * A entrevista concluída volta a "em andamento" para a pessoa responder os pontos escolhidos entre as pendências do
 * resultado. A pessoa entrevistada escolhe; gestores e administradores podem marcar para ela. Ao encerrar de novo,
 * o resultado é refeito com a conversa inteira.
 */
export async function retomar(id: string, d: z.infer<typeof RetomarSchema>, pessoa?: Pessoa | null) {
  const linha = await carregar(id);
  if (linha.status !== 'concluida' || !linha.resultado) throw new ErroApi(409, 'Só uma entrevista concluída, com resultado, pode ser completada.');
  if (!ehGestor(pessoa)) exigirEntrevistado(linha, pessoa);
  const abertas = new Set(linha.resultado.pendencias);
  const escolhidas = [...new Set(d.pendencias)].filter((p) => abertas.has(p));
  if (!escolhidas.length) throw new ErroApi(400, 'Escolha ao menos um ponto que ficou em aberto nesta entrevista.');
  const complemento: Complemento = { pendencias: escolhidas, escolhidas_em: agora(), escolhidas_por: pessoa?.id ?? null, a_partir_do_turno: linha.turnos.length };
  await salvar(id, { status: 'em_andamento', complemento });
  return { ok: true as const, pendencias: escolhidas.length };
}

/** Desiste do complemento antes de a conversa continuar: volta a concluída, com o resultado que já tinha. */
export async function desistirComplemento(id: string, pessoa?: Pessoa | null) {
  const linha = await carregar(id);
  const c = complementoAberto(linha);
  if (linha.status !== 'em_andamento' || !c) throw new ErroApi(409, 'Esta entrevista não está esperando um complemento.');
  if (!ehGestor(pessoa)) exigirEntrevistado(linha, pessoa);
  if (emLigacao(linha) && pessoa && linha.entrevistado_id !== pessoa.id) throw new ErroApi(409, MSG_EM_LIGACAO, 'em_ligacao');
  if (linha.turnos.length > c.a_partir_do_turno) throw new ErroApi(409, 'A conversa já continuou: encerre a entrevista para gerar o resultado novo.');
  await salvar(id, { status: 'concluida', complemento: null });
  return { ok: true as const };
}

// --- Listas ---

/** Os nomes das pessoas entrevistadas, por id. */
async function nomesDasPessoas(ids: (string | null | undefined)[]) {
  const unicos = [...new Set(ids.filter((x): x is string => !!x))];
  if (!unicos.length) return new Map<string, string>();
  const { data, error } = await supabase().from('pessoas').select('id, nome').in('id', unicos);
  if (error) throw error;
  return new Map(((data ?? []) as { id: string; nome: string }[]).map((p) => [p.id, p.nome]));
}

type ProcessoEmbutido = { id: string; nome: string } | null;

const perfilDe = (r: unknown): PerfilEntrevistado | null => {
  const e = (r as ResultadoEntrevista | null)?.entrevistado;
  const perfil = { area: e?.area?.trim() ?? '', funcao: e?.funcao?.trim() ?? '' };
  return perfil.area || perfil.funcao ? perfil : null;
};

/**
 * O que a pessoa já contou sobre si à Maia (área e o que faz; decisão 67), na conversa concluída mais recente:
 * a Maia não pergunta de novo e a análise aproveita.
 */
export async function perfilConhecido(entrevistadoId: string | null | undefined): Promise<PerfilEntrevistado | null> {
  if (!entrevistadoId) return null;
  const { data, error } = await supabase().from('entrevistas').select('resultado, encerrado_em').eq('tenant_id', TENANT_PADRAO).eq('entrevistado_id', entrevistadoId)
    .not('resultado', 'is', null).order('encerrado_em', { ascending: false }).limit(10);
  if (error) return null;
  for (const l of data ?? []) { const p = perfilDe(l.resultado); if (p) return p; }
  return null;
}

/** Todas as entrevistas, da mais recente para a mais antiga, com o processo e a pessoa de cada uma. */
/**
 * As entrevistas da tela "Conversas com a Maia" (decisão 60): quem é comum recebe só as suas; gestores e
 * administradores, todas. Cada uma vem com o processo (e a área dele) e as datas do convite e da conversa.
 */
export async function listar(pessoa?: Pessoa | null) {
  let consulta = supabase().from('entrevistas').select('id, tema, status, turnos, metricas, entrevistado_id, convidado_por, convidado_em, convite_enviado_em, iniciada_em, em_ligacao_ate, complemento, criado_em, encerrado_em, processo:processos(id, nome, area:areas(id, nome))')
    .eq('tenant_id', TENANT_PADRAO);
  if (!ehGestor(pessoa)) consulta = consulta.eq('entrevistado_id', pessoa!.id);
  const { data, error } = await consulta.order('criado_em', { ascending: false });
  if (error) throw error;
  const linhas = data ?? [];
  const nomes = await nomesDasPessoas(linhas.flatMap((l) => [l.entrevistado_id as string | null, l.convidado_por as string | null]));
  return linhas.map(({ turnos, metricas, entrevistado_id, convidado_por, processo, complemento, em_ligacao_ate, ...e }) => {
    const t = (turnos as Turno[] | null) ?? [];
    const m = (metricas as Metricas | null) ?? {};
    return {
      ...e, em_ligacao: emLigacao({ status: e.status as string, em_ligacao_ate: em_ligacao_ate as string | null }), entrevistado_id: (entrevistado_id as string | null) ?? null, entrevistado: nomes.get(entrevistado_id as string) ?? null,
      convidado_por: nomes.get(convidado_por as string) ?? null,
      processo: (processo as unknown as (ProcessoEmbutido & { area: { id: string; nome: string } | null })) ?? null,
      complemento_pendencias: complementoAberto({ complemento: (complemento as Complemento | null) ?? null })?.pendencias.length ?? null,
      falas: t.length, duracao_s: m.duracao_s ?? 0, custo_analise_usd: m.analise?.custo_usd ?? 0, custo_consultas_usd: (m.consultas ?? []).reduce((a, c) => a + (c.custo_usd || 0), 0),
    };
  });
}

/**
 * O material de uma ou mais conversas com a Maia para a IA desenhar o fluxograma do processo (decisões 63 e 68):
 * de cada conversa, tudo o que foi gerado: quem é a pessoa, a descrição do processo, a ficha inteira (etapas com
 * responsável, ferramentas, entradas, saídas, regras e exceções), as dificuldades, os pontos em aberto, as
 * perguntas para outra pessoa e a transcrição, com a marca de onde a pessoa voltou para completar. Só entram
 * conversas deste processo, e só as que têm falas.
 */
export async function textoParaFluxograma(processoId: string, ids: string[]) {
  const unicos = [...new Set(ids)];
  if (!UUID.test(processoId) || !unicos.length || unicos.some((id) => !UUID.test(id))) throw new ErroApi(404, 'Conversa não encontrada neste processo.');
  const db = supabase();
  const [proc, conv] = await Promise.all([
    db.from('processos').select('nome').eq('tenant_id', TENANT_PADRAO).eq('id', processoId).maybeSingle(),
    db.from('entrevistas').select('id, status, em_ligacao_ate, turnos, resultado, complemento, entrevistado_id, iniciada_em, criado_em').eq('tenant_id', TENANT_PADRAO).eq('processo_id', processoId).in('id', unicos).order('criado_em'),
  ]);
  for (const r of [proc, conv]) if (r.error) throw r.error;
  if (!proc.data) throw new ErroApi(404, 'Processo não encontrado');
  const linhas = conv.data ?? [];
  if (linhas.length !== unicos.length) throw new ErroApi(404, 'Conversa não encontrada neste processo.');
  const nomes = await nomesDasPessoas(linhas.map((l) => l.entrevistado_id as string | null));
  const lista = (rotulo: string, itens: string[] | undefined) => (itens?.length ? `; ${rotulo}: ${itens.join(', ')}` : '');
  const blocos = linhas.map((l, i) => {
    const turnos = (l.turnos as Turno[] | null) ?? [];
    const quem = nomes.get(l.entrevistado_id as string) ?? 'pessoa entrevistada';
    if (emLigacao({ status: l.status as string, em_ligacao_ate: l.em_ligacao_ate as string | null })) throw new ErroApi(409, `${quem} está conversando com a Maia agora. A conversa entra no fluxograma quando a ligação terminar.`, 'em_ligacao');
    if (!turnos.some((t) => t.quem !== 'ia' && !t.apoio)) throw new ErroApi(422, `A conversa de ${quem} ainda não tem falas para virar fluxograma.`);
    const r = (l.resultado as ResultadoEntrevista | null) ?? null;
    const f = r?.ficha;
    const perfil = perfilDe(r);
    const descricao = r?.descricao ? textoPuro(r.descricao).replace(/\s+/g, ' ').trim() : '';
    const resumo = !f ? '' : [
      perfil && `Quem é a pessoa: ${[perfil.area && `área ${perfil.area}`, perfil.funcao].filter(Boolean).join('; ')}`,
      descricao && `Descrição do processo: ${descricao}`,
      f.objetivo && `Objetivo: ${f.objetivo}`,
      f.gatilho && `O que dá início: ${f.gatilho}`,
      f.resultado && `Resultado: ${f.resultado}`,
      f.etapas?.length && `Etapas:\n${f.etapas.map((e, k) => `${k + 1}. ${e.nome}${e.responsavel ? ` (quem faz: ${e.responsavel})` : ''}${e.descricao ? `: ${e.descricao}` : ''}${lista('ferramentas', e.ferramentas)}${lista('entradas', e.entradas)}${lista('saídas', e.saidas)}${lista('regras', e.regras)}${lista('exceções', e.excecoes)}`).join('\n')}`,
      f.dificuldades?.length && `Dificuldades relatadas: ${f.dificuldades.join('; ')}`,
      r?.pendencias?.length && `Ficou em aberto (perguntas ainda sem resposta):\n${r.pendencias.map((p) => `- ${p}`).join('\n')}`,
      r?.pendencias_outra_pessoa?.length && `Para outra pessoa responder (a pessoa disse não saber):\n${r.pendencias_outra_pessoa.map((x) => `- ${x.pergunta} (quem sabe: ${x.quem_sabe})`).join('\n')}`,
    ].filter(Boolean).join('\n');
    // Onde a pessoa voltou para completar (decisão 56): o que ela disse dali em diante vale sobre o que disse antes.
    const volta = (l.complemento as Complemento | null)?.a_partir_do_turno ?? 0;
    const transcricao = volta > 0 && volta < turnos.length
      ? `${transcricaoDaConversa(turnos.slice(0, volta))}\n[A pessoa voltou à ligação para responder pontos que tinham ficado em aberto. O que ela disse daqui em diante vale sobre o que disse antes.]\n${transcricaoDaConversa(turnos.slice(volta))}`
      : transcricaoDaConversa(turnos);
    const data = new Date((l.iniciada_em ?? l.criado_em) as string).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    return `<conversa numero="${i + 1}" entrevistado="${quem.replace(/"/g, "'")}" data="${data}">\n${resumo ? `<resumo_da_maia>\n${resumo}\n</resumo_da_maia>\n` : ''}<transcricao>\n${transcricao}\n</transcricao>\n</conversa>`;
  });
  return `<processo>\nNome do processo: ${proc.data.nome}\n</processo>\n\n${blocos.join('\n\n')}`;
}

/** As entrevistas de um processo, para a seção "Entrevistas com a Maia" da página dele. */
export async function listarDoProcesso(processoId: string) {
  if (!UUID.test(processoId)) throw new ErroApi(404, 'Processo não encontrado');
  const { data, error } = await supabase().from('entrevistas').select('id, status, turnos, metricas, resultado, entrevistado_id, convidado_por, convidado_em, convite_enviado_em, iniciada_em, em_ligacao_ate, complemento, criado_em, encerrado_em')
    .eq('tenant_id', TENANT_PADRAO).eq('processo_id', processoId).order('criado_em', { ascending: false });
  if (error) throw error;
  const linhas = data ?? [];
  const nomes = await nomesDasPessoas(linhas.flatMap((l) => [l.entrevistado_id as string | null, l.convidado_por as string | null]));
  return linhas.map(({ turnos, metricas, resultado, entrevistado_id, convidado_por, complemento, em_ligacao_ate, ...e }) => {
    const r = (resultado as ResultadoEntrevista | null) ?? null;
    const em_ligacao = emLigacao({ status: e.status as string, em_ligacao_ate: em_ligacao_ate as string | null });
    return {
      ...e, em_ligacao, entrevistado_id: (entrevistado_id as string | null) ?? null, entrevistado: nomes.get(entrevistado_id as string) ?? null, convidado_por: nomes.get(convidado_por as string) ?? null,
      complemento_pendencias: complementoAberto({ complemento: (complemento as Complemento | null) ?? null })?.pendencias.length ?? null,
      falas: ((turnos as Turno[] | null) ?? []).length, duracao_s: ((metricas as Metricas | null) ?? {}).duracao_s ?? 0,
      entrevistado_area: perfilDe(r)?.area || null,
      tem_resultado: !!r, pendencias: r?.pendencias?.length ?? 0,
      pendencias_outra_pessoa: em_ligacao ? [] : r?.pendencias_outra_pessoa ?? [], // perguntas para outras pessoas (decisão 58); nada durante a ligação (decisão 69)
    };
  });
}

/** Painel da Maia (decisão 52, só administradores): como ela está configurada e cada entrevista com tempos, métricas e custos. */
export async function painel() {
  const { data, error } = await supabase().from('entrevistas').select('id, tema, status, turnos, metricas, entrevistado_id, em_ligacao_ate, criado_em, encerrado_em, processo:processos(id, nome)')
    .eq('tenant_id', TENANT_PADRAO).order('criado_em', { ascending: false });
  if (error) throw error;
  const linhas = data ?? [];
  const nomes = await nomesDasPessoas(linhas.map((l) => l.entrevistado_id as string | null));
  return {
    configuracao: {
      nome: NOME_IA, apresentacao: `Eu sou a ${NOME_IA}, trabalho ${COM_QUEM}`, modelo_voz: MODELO_VOZ, voz: VOZ, preco_voz_usd_min: PRECO_VOZ_USD_MIN,
      modelo_consulta: MODELO_CONSULTA, modelo_analise: MODELO_ANALISE, frase_final: FRASE_FINAL, frase_pausa: FRASE_PAUSA, ...LIMITES_ENTREVISTA,
    },
    entrevistas: linhas.map(({ turnos, metricas, entrevistado_id, processo, em_ligacao_ate, ...e }) => {
      const m = (metricas as Metricas | null) ?? {};
      const r = resumoMetricas(m);
      return {
        ...e, em_ligacao: emLigacao({ status: e.status as string, em_ligacao_ate: em_ligacao_ate as string | null }), entrevistado: nomes.get(entrevistado_id as string) ?? null, processo: (processo as unknown as ProcessoEmbutido)?.nome ?? null, falas: ((turnos as Turno[] | null) ?? []).length,
        duracao_s: m.duracao_s ?? 0, sessoes: m.sessoes ?? (m.duracao_s ? 1 : 0), pausas: m.pausas ?? 0, consultas: r.consultas,
        reacao_mediana_ms: r.reacao_mediana_ms ?? null, conexao_ms: m.conexao_ms ?? null,
        custo_voz_usd: r.custo_voz_usd, custo_consultas_usd: r.custo_consultas_usd, custo_analise_usd: r.custo_analise_usd, custo_total_usd: r.custo_total_usd,
        erros: m.erros?.length ?? 0,
      };
    }),
  };
}

/**
 * A entrevista inteira. Enquanto a pessoa está na ligação com a Maia (decisão 69), só ela recebe a conversa: para
 * os outros, inclusive o administrador, vêm os dados da entrevista sem as falas, as gravações e o resultado
 * (`conteudo_oculto`), até a ligação terminar.
 */
export async function obter(id: string, pessoa?: Pessoa | null) {
  const linha = await carregar(id);
  const em_ligacao = emLigacao(linha);
  const oculto = em_ligacao && !!pessoa && linha.entrevistado_id !== pessoa.id;
  // Uma gravação por sessão de voz (quem continua a entrevista grava um arquivo novo).
  const arquivos = oculto ? [] : await gravacoes(id);
  let audios: string[] = [];
  if (arquivos.length) {
    const { data } = await supabase().storage.from(BUCKET).createSignedUrls(arquivos, 60 * 60);
    audios = (data ?? []).map((x) => x.signedUrl).filter((u): u is string => !!u);
  }
  const nomes = await nomesDasPessoas([linha.entrevistado_id, linha.convidado_por]);
  const processo = linha.processo_id ? await processoDoConvite(linha.processo_id).catch(() => null) : null;
  const { em_ligacao_ate: _prazo, ...dados } = linha;
  void _prazo;
  return {
    // As métricas também saem: as consultas e os erros guardam trechos da conversa.
    ...dados, ...(oculto ? { turnos: [] as Turno[], resultado: null, metricas: {} as Metricas, falas_ocultas: linha.turnos.filter((t) => !t.apoio).length } : {}),
    em_ligacao, conteudo_oculto: oculto,
    entrevistado: nomes.get(linha.entrevistado_id ?? '') ?? null, convidador: nomes.get(linha.convidado_por ?? '') ?? null,
    processo: processo ? { id: processo.id, nome: processo.nome, area: processo.area } : null,
    audios, frase_final: FRASE_FINAL, frase_pausa: FRASE_PAUSA,
  };
}

/**
 * A situação da entrevista, leve (sem a conversa): as telas abertas consultam para perceber quando a ligação começa
 * ou termina (decisão 69).
 */
export async function situacaoDaLigacao(id: string) {
  if (!UUID.test(id)) throw new ErroApi(404, 'Entrevista não encontrada');
  const { data, error } = await supabase().from('entrevistas').select('status, em_ligacao_ate').eq('tenant_id', TENANT_PADRAO).eq('id', id).maybeSingle();
  if (error) throw error;
  if (!data) throw new ErroApi(404, 'Entrevista não encontrada');
  return { status: data.status as StatusEntrevista, em_ligacao: emLigacao(data as { status: string; em_ligacao_ate: string | null }) };
}

/**
 * Exclui a entrevista inteira (a conversa, o áudio e o resultado). Convite pendente: gestores e administradores
 * cancelam. Entrevista que já começou: só administradores (decisão 54), em qualquer situação, menos enquanto a
 * pessoa está na ligação ou o resultado está sendo gerado. Ninguém edita o que veio da conversa: ou fica como
 * está, ou sai inteira.
 */
export async function excluir(id: string, quem?: Pessoa | null) {
  const linha = await carregar(id);
  if (linha.status !== 'convidada' && quem && quem.nivel !== 'admin') throw new ErroApi(403, 'Só administradores excluem entrevistas que já começaram. Gestores cancelam convites pendentes.');
  const desde = Date.now() - new Date(linha.atualizado_em).getTime();
  if (emLigacao(linha)) throw new ErroApi(409, MSG_EM_LIGACAO, 'em_ligacao');
  if (linha.status === 'processando' && desde < 3 * 60_000) throw new ErroApi(409, 'O resultado desta entrevista está sendo gerado. Tente de novo em alguns minutos.', 'processando');
  const arquivos = await gravacoes(id);
  if (arquivos.length) await supabase().storage.from(BUCKET).remove(arquivos);
  const { error } = await supabase().from('entrevistas').delete().eq('tenant_id', TENANT_PADRAO).eq('id', id);
  if (error) throw error;
}

// --- A sessão de voz (GPT-Live) ---

const TOPICOS_TEXTO = TOPICOS.map((t) => `- ${t.nome}: ${t.o_que}`).join('\n');

/** As instruções da sessão: o papel de entrevistador, o tema e o jeito de conduzir uma conversa por voz. */
export function instrucoesDaSessao(l: Pick<Linha, 'tema' | 'contexto'>, continuando: boolean, entrevistado?: string | null, complemento?: Complemento | null, perfil?: PerfilEntrevistado | null) {
  const primeiro = entrevistado?.trim().split(/\s+/)[0] || '';
  // Quem é a pessoa (decisão 67): a Maia pergunta a área e o que ela faz antes de entrar no processo; se a
  // pessoa já contou em outra conversa, a Maia já sabe e não pergunta de novo.
  const sobreAPessoa = perfil
    ? `O que você já sabe sobre ${primeiro || 'a pessoa'}, de outra conversa: ${[perfil.area && `é da área ${comoSeFala(perfil.area)}`, perfil.funcao && `o que faz: ${comoSeFala(perfil.funcao)}`].filter(Boolean).join('; ')}. Não pergunte isso de novo.\n`
    : '';
  const abertura = perfil
    ? `Abra curto, em no máximo duas frases, e já faça a primeira pergunta: diga quem você é, com quem trabalha e que a conversa fica gravada. Por exemplo: "${primeiro ? `Oi, ${primeiro}! Eu` : 'Oi, eu'} sou a ${NOME_IA}, trabalho ${COM_QUEM.replace(' da Ínqui', '')}. Essa conversa fica gravada, tá? Pra começar, me conta: para que serve esse processo?"`
    : `Abra curto, em no máximo duas frases: diga quem você é, com quem trabalha e que a conversa fica gravada, e comece pela pessoa, antes do processo. Por exemplo: "${primeiro ? `Oi, ${primeiro}! Eu` : 'Oi, eu'} sou a ${NOME_IA}, trabalho ${COM_QUEM.replace(' da Ínqui', '')}. Essa conversa fica gravada, tá? Antes de entrar no processo, me conta rapidinho: de qual área você é e o que você faz no dia a dia?" Depois que ela responder, reaja em poucas palavras e siga para o processo ("E esse processo, para que ele serve?"). É uma pergunta só, para conhecer quem está falando: se ela disser só a área ou só o cargo, não insista nem aprofunde`;
  // Voltou para fechar pontos em aberto (decisão 56): cumprimenta de volta e vai direto aos pontos escolhidos.
  const retomada = complemento
    ? `A pessoa voltou para completar a entrevista (o histórico está acima). Ela escolheu responder a estes pontos que ficaram em aberto:\n${complemento.pendencias.map((p, i) => `${i + 1}. ${comoSeFala(p)}`).join('\n')}\nAo abrir, cumprimente de volta em uma frase ("Oi de novo${primeiro ? `, ${primeiro}` : ''}! Que bom que você voltou."), diga que vocês vão fechar os pontos que ficaram em aberto e já faça a primeira pergunta da lista. Percorra só esses pontos, um por vez, aprofundando quando a resposta for vaga (se ela não souber, pergunte quem saberia e siga); não refaça a entrevista, não repita o resumo anterior nem a lista de conferência do fim. Ao terminar a lista, resuma em uma frase o que foi acrescentado e despeça-se com "${FRASE_FINAL.toLowerCase()}". Não repita a apresentação nem o aviso da gravação.`
    : 'A conversa já começou antes e foi pausada; o histórico dela está acima. Ao abrir, mostre que lembra: diga que bom que a pessoa voltou, lembre em uma frase onde vocês pararam e o que ficou faltando, e siga com a próxima pergunta. Não repita a apresentação nem o aviso da gravação. Se for outra pessoa, apresente-se em uma frase e pergunte o nome dela.';
  // Segue o esqueleto do guia de prompt do GPT-Live: papel, jeito de falar e as três políticas com os
  // rótulos originais (Backchannel policy, Interruption policy, Delegation policy), que o modelo reconhece.
  return `# Papel
Você é a ${NOME_IA}, consultora de mapeamento de processos, fazendo uma entrevista por voz, ao vivo, com uma pessoa que executa ou conhece bem um processo de trabalho. Você trabalha ${COM_QUEM}. Fale sempre em português do Brasil, com naturalidade, tratando a pessoa por "você". Se perguntarem, diga que é uma inteligência artificial.

# Jeito de falar
- Ritmo de conversa: frases completas e fluidas, com pausas só entre frases, nunca longas no meio de uma frase. Sem muletas ("eh", "é...", "né") e sem repetir palavras.
- Curto e direto: uma ideia por vez, uma pergunta por vez. Números pequenos por extenso. Nada de listas faladas.
- Quando a pessoa concluir a ideia, responda sem demora. Mas, se ela pausar no meio de um raciocínio (frase incompleta, "eh…", "então…", "aí…"), espere: é melhor esperar um instante a mais do que começar a falar e se cortar. Se você começou a falar e ela continuou, pare e deixe-a terminar; não retome a frase cortada. Nunca fique só no "aham" esperando: ideia concluída, a vez é sua.
- Quando couber, reaja em poucas palavras ("Entendi.", "Faz sentido.") e emende a próxima pergunta.
- O nome da empresa é Ínqui. Diga sempre "Ínqui", uma palavra só; nunca soletre letras.

Backchannel policy: Enquanto a pessoa explica, mostre que está ouvindo com sinais curtos e variados, sem vício: alterne "aham", "uhum", "sei", "certo", "entendi", "tá", "faz sentido", "ah, legal", e muitas vezes fique só em silêncio. Nunca repita o mesmo sinal duas vezes seguidas e use poucos: no máximo um a cada trecho longo da fala dela, sem competir com ela. Varie também o começo das respostas (não comece sempre com "Entendi" ou "Tá"). Um sinal de escuta nunca substitui uma resposta.

Interruption policy: Quando a pessoa começar a falar por cima de você, pare de falar imediatamente, mesmo no meio da frase, e ouça até ela terminar; depois responda ao que ela disse. Se ela pedir para parar ou esperar, corrigir algo, fazer uma pergunta ou pedir para encerrar, pare na hora, sem terminar a frase e sem acrescentar nada. Não retome o que foi cortado, a não ser que ela peça. Só um "aham", "uhum", "sei" ou "tá" breve dela não é interrupção: aí continue.

Delegation policy: Quando a pessoa pedir para você pesquisar, verificar ou explicar algo de conhecimento geral (o que é um sistema, uma sigla, uma lei, uma prática de mercado), ou quando você precisar disso para entender o que ela disse, gere <|SpawnThinking|> e diga em poucas palavras que vai ver ("Deixa eu ver aqui."). Quando o resultado chegar, conte o essencial em uma ou duas frases e volte ao processo com uma pergunta que ligue o que você descobriu ao que a pessoa contou. Nunca gere <|SpawnThinking|> para saber como o processo dela funciona: isso só ela sabe, então pergunte a ela. Não prometa responder depois ("te respondo já"): consulte agora ou diga que não sabe e siga.

# O que vamos mapear
Processo: ${comoSeFala(l.tema)}
${primeiro ? `Pessoa entrevistada: ${entrevistado!.trim()}. Chame-a pelo primeiro nome, ${primeiro}, de vez em quando, sem exagero.\n` : ''}${sobreAPessoa}${l.contexto ? `Contexto dado por quem abriu a entrevista: ${comoSeFala(l.contexto)}\n` : ''}
# Objetivo
Entender o processo de ponta a ponta para, depois da conversa, escrever a descrição e desenhar o fluxograma. Tópicos a cobrir:
${TOPICOS_TEXTO}

# Como conduzir
- ${continuando ? retomada : abertura}
- Comece pela visão geral e pelo início do processo; depois percorra as etapas na ordem em que acontecem e, em cada etapa, descubra quem faz, com que sistema ou documento, o que precisa existir antes e o que sai dela. Regras, exceções e dificuldades entram quando a pessoa as cita ou quando as etapas já estão claras.
- Aprofunde respostas vagas ("como é feito isso?", "me dá um exemplo?"). Quando a pessoa citar uma decisão ("se for aprovado"), pergunte o que acontece em cada caminho.
- De vez em quando, repita em uma frase o que entendeu e peça confirmação. Nunca pergunte o que a pessoa já respondeu.
- Se não entender uma palavra ou um nome de sistema, peça para repetir ou soletrar. Se ela perguntar o que você quer saber, ou parecer perdida, responda com uma pergunta concreta.
- Enquanto a pessoa explica, não a interrompa; interrompa só para evitar um mal-entendido grande.
- Se a pessoa pedir um instante, espere em silêncio até ela voltar.

# Ritmo e encerramento
- A entrevista termina quando os tópicos estiverem cobertos, não pelo tempo. Antes de resumir, repasse os tópicos e explore o que ainda estiver em aberto, uma pergunta por vez. Confira em especial: o que acontece quando uma aprovação ou decisão é negada ou algo dá errado; prazos; quem participa de cada etapa; com que frequência o processo acontece; o que costuma dar problema. Se a pessoa não souber responder, pergunte em uma frase quem saberia (a área ou o cargo) e siga para o próximo ponto (vira pergunta para essa outra pessoa).
- Lista de conferência, obrigatória antes de se despedir: você só pode dizer a despedida depois de ter perguntado, de forma direta, (1) quem faz cada etapa, com cargo e quantas pessoas; (2) prazos e tempos de cada etapa; (3) o que acontece quando algo dá errado ou não é resolvido (por exemplo, um item reprovado que não volta corrigido, uma aprovação negada); (4) o que costuma dar problema, demorar ou gerar retrabalho. Entender o caminho feliz não basta: mesmo que a pessoa pareça ter concluído e o resumo esteja confirmado, passe pela lista antes de encerrar.
- Se a pessoa perguntar "alguma dúvida?", "mais alguma coisa?" ou "é isso?", é um convite para perguntar: faça as perguntas da lista que ainda faltam, uma por vez, em vez de responder que ficou claro.
- "Acho que é isso" ou "tá bom" depois de um resumo não é pedido para encerrar: se ainda houver lacuna, pergunte.
- Com os tópicos e a lista de conferência cobertos, faça um resumo curto do processo e pergunte se está certo. Depois da confirmação ou das correções, despeça-se em uma ou duas frases, como numa conversa de verdade, dizendo "${FRASE_FINAL.toLowerCase()}". Por exemplo: "Olha, acho que deu para entender bem o processo. Então ${FRASE_FINAL.toLowerCase()}. Muito obrigada pela conversa!"
- Se a pessoa precisar sair ou pedir para continuar outra hora antes de os tópicos estarem cobertos (ou perguntar se ficou alguma dúvida), insista um pouco: diga em uma frase o que ainda falta e pergunte se ela consegue responder quatro perguntas rápidas antes de sair. Se ela topar, faça as quatro mais importantes, uma por vez e bem curtas, e cumpra o combinado: depois da quarta resposta, despeça-se. Se ainda ficar algo em aberto, despeça-se com "${FRASE_PAUSA.toLowerCase()}" (por exemplo: "Obrigada! Ficou faltando entender o que acontece quando o terreno é reprovado. ${FRASE_PAUSA}, tá?"); se tudo ficou coberto, com "${FRASE_FINAL.toLowerCase()}". Se ela disser que não dá agora ou repetir que precisa sair, não insista: despeça-se na hora com "${FRASE_PAUSA.toLowerCase()}". A conversa fica guardada e, quando a pessoa voltar, vocês seguem de onde pararam.
- Se a pessoa disser que não vai ter outra conversa, que já falou tudo o que sabe ou que quer encerrar de vez, não insista: agradeça e despeça-se dizendo "${FRASE_FINAL.toLowerCase()}" (o que faltou vira pendência).
- "${FRASE_FINAL}" encerra a entrevista de vez; "${FRASE_PAUSA}" pausa a entrevista para continuar outra hora. Diga só uma das duas, uma única vez, e só na despedida. Não use frases de sistema como "entrevista concluída".`;
}

/** Histórico para continuar uma conversa interrompida (o GPT-Live aceita até 128 mensagens e cerca de 8 mil tokens). */
export function historicoParaSessao(turnos: Turno[]) {
  const msgs: { role: 'user' | 'assistant'; content: { type: 'input_text' | 'output_text'; text: string }[] }[] = [];
  let chars = 0;
  for (const t of [...turnos].reverse()) {
    if (t.apoio) continue; // os "aham" não ajudam a retomar e gastam o limite do histórico
    const texto = comoSeFala(limparMarcasDeSom(t.texto).slice(0, 2000));
    if (msgs.length >= 120 || chars + texto.length > 24_000) break;
    chars += texto.length;
    msgs.unshift(t.quem === 'ia' ? { role: 'assistant', content: [{ type: 'output_text', text: texto }] } : { role: 'user', content: [{ type: 'input_text', text: texto }] });
  }
  return msgs;
}

/** Abre uma sessão de voz: recebe a oferta WebRTC do navegador e devolve a resposta da OpenAI. */
export async function abrirSessao(id: string, sdp: string, pessoa?: Pessoa | null) {
  const linha = await carregar(id);
  if (linha.status !== 'em_andamento' && linha.status !== 'convidada') throw new ErroApi(409, 'Esta entrevista já foi encerrada.');
  exigirEntrevistado(linha, pessoa); // só a pessoa convidada abre a sessão (decisão 49)
  const chave = process.env.OPENAI_API_KEY;
  if (!chave) throw new ErroApi(503, 'A entrevista por voz ainda não está configurada (falta OPENAI_API_KEY).');
  const continuando = linha.turnos.length > 0;
  // O nome que a Maia usa: a pessoa logada ou, sem login (desenvolvimento), a pessoa convidada.
  const nome = pessoa?.nome ?? (linha.entrevistado_id ? (await nomesDasPessoas([linha.entrevistado_id])).get(linha.entrevistado_id) ?? null : null);
  const complemento = complementoAberto(linha);
  const perfil = continuando ? null : await perfilConhecido(linha.entrevistado_id); // só importa na abertura
  const session = {
    model: MODELO_VOZ,
    instructions: instrucoesDaSessao(linha, continuando, nome, complemento, perfil),
    audio: { output: { voice: VOZ } },
    delegation: { type: 'client' }, // as consultas ("deixa eu ver aqui") quem faz é o app, com o Claude (decisão 44)
    store: false,
    ...(continuando ? { input: historicoParaSessao(linha.turnos) } : {}),
    // O navegador só pode encerrar a sessão, pedir uma fala (a abertura, se a IA não começar sozinha) e
    // entregar o resultado de uma consulta.
    client: { data_channel: { allowed_client_events: ['session.close', 'session.commentary.append', 'session.thinking.append'] } },
  };
  let r: Response;
  const inicio = Date.now();
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
  const openai_ms = Date.now() - inicio; // quanto da abertura foi a OpenAI (o resto é a Vercel e a rede)
  // A sessão começou: a entrevista convidada passa a "em andamento"; sem convite (desenvolvimento), quem abriu
  // a primeira sessão fica como entrevistado.
  await salvar(id, {
    ...(j.session?.id ? { sessoes: [...(linha.sessoes ?? []), j.session.id].slice(-50) } : {}),
    ...(pessoa && !linha.entrevistado_id ? { entrevistado_id: pessoa.id } : {}),
    ...(linha.status === 'convidada' ? { status: 'em_andamento' as const } : {}),
    iniciada_em: linha.iniciada_em ?? agora(),
    em_ligacao_ate: prazoDaLigacao(), // a ligação começou (decisão 69)
  });
  return { sdp: j.transport.sdp, continuando, openai_ms, complemento: !!complemento };
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

export async function consultar(id: string, turnos: Turno[], pessoa?: Pessoa | null) {
  const linha = await carregar(id);
  if (linha.status !== 'em_andamento') throw new ErroApi(409, 'Esta entrevista já foi encerrada.');
  exigirEntrevistado(linha, pessoa);
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
  /** true: a ligação continua (renova o sinal); false: a ligação terminou (pausa ou fim). Sem o campo, não mexe. */
  em_ligacao: z.boolean().optional(),
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
    conexao_etapas: z.object({
      microfone_ms: z.number().min(0).optional(),
      oferta_ms: z.number().min(0).optional(),
      servidor_ms: z.number().min(0).optional(),
      openai_ms: z.number().min(0).optional(),
      inicio_ms: z.number().min(0).optional(),
    }).optional(),
    apoios_por_sinal: z.record(z.string().max(40), z.number()).optional(),
    pausas: z.number().min(0).optional(),
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

export async function salvarConversa(id: string, c: z.infer<typeof ConversaSchema>, pessoa?: Pessoa | null) {
  const linha = await carregar(id);
  if (linha.status !== 'em_andamento') throw new ErroApi(409, 'Esta entrevista já foi encerrada.');
  exigirEntrevistado(linha, pessoa);
  // Os erros somam (os do navegador e os já guardados); o resto é o valor mais novo.
  const erros = [...new Set([...(linha.metricas?.erros ?? []), ...(c.metricas?.erros ?? [])])].slice(-30);
  const ligacao = c.em_ligacao === undefined ? {} : { em_ligacao_ate: c.em_ligacao ? prazoDaLigacao() : null };
  await salvar(id, { turnos: c.turnos, ...(c.metricas ? { metricas: { ...linha.metricas, ...c.metricas, erros } } : {}), ...ligacao });
  return { ok: true };
}

/**
 * O pulso da ligação (decisão 69): enquanto a pessoa conversa com a Maia e não há fala nova para guardar, o
 * navegador dela avisa a cada 15 s que a ligação continua; ao fechar a página, avisa que acabou (`ligada` falso).
 * Leve: uma atualização, sem carregar a conversa.
 */
export async function pulsoDaLigacao(id: string, pessoa?: Pessoa | null, ligada = true) {
  if (!UUID.test(id)) throw new ErroApi(404, 'Entrevista não encontrada');
  let q = supabase().from('entrevistas').update({ em_ligacao_ate: ligada ? prazoDaLigacao() : null }).eq('tenant_id', TENANT_PADRAO).eq('id', id).eq('status', 'em_andamento');
  if (pessoa) q = q.eq('entrevistado_id', pessoa.id);
  const { data, error } = await q.select('id');
  if (error) throw error;
  return { ok: (data ?? []).length > 0 };
}

// Preços da Anthropic por milhão de tokens (tabela de 06/10/2026): entrada, saída, leitura de cache.
// A escrita no cache custa 1,25× a entrada. Modelo desconhecido: assume o do Sonnet.
const PRECOS_USD_MTOK: Record<string, { entrada: number; saida: number; cache: number }> = {
  'claude-sonnet-5-5': { entrada: 2, saida: 10, cache: 0.1 }, // leitura de cache: 0,05x da entrada no Sonnet 5.5 e no Opus 5.5
  'claude-haiku-5-5': { entrada: 0.1, saida: 0.5, cache: 0.01 },
  'claude-opus-5-5': { entrada: 4, saida: 20, cache: 0.2 },
};
export function custoAnalise(uso: UsoIa) {
  const preco = PRECOS_USD_MTOK[Object.keys(PRECOS_USD_MTOK).find((k) => uso.modelo.startsWith(k)) ?? 'claude-sonnet-5-5'];
  return (uso.entrada * preco.entrada + uso.saida * preco.saida + uso.cache_leitura * preco.cache + uso.cache_escrita * preco.entrada * 1.25) / 1_000_000;
}

// --- Depois da chamada: a conversa inteira vira a descrição, a ficha e as pendências ---

const ResultadoSchema = z.object({
  entrevistado: z.object({
    area: z.string().describe('A área ou o setor da pessoa entrevistada, como ela disse (ex.: "Departamento Pessoal"); vazio se ela não disse'),
    funcao: z.string().describe('O que ela faz: o cargo e as atividades do dia a dia, em uma frase curta; vazio se ela não disse'),
  }).describe('Quem é a pessoa entrevistada, só com o que ela contou sobre si'),
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
  pendencias: z.array(z.string()).describe(`Perguntas que a própria pessoa entrevistada pode responder numa próxima conversa: só o que faz falta para descrever o processo, no máximo ${MAX_PENDENCIAS}`),
  pendencias_outra_pessoa: z.array(z.object({
    pergunta: z.string().describe('A pergunta, curta'),
    quem_sabe: z.string().describe('A área ou o cargo que saberia responder, como a pessoa disse ou como fica claro na conversa (ex.: "Financeiro")'),
  })).describe('O que a pessoa entrevistada disse não saber, não ter acesso ou ser de outra área'),
});

// A análise depois que a pessoa voltou para completar (decisão 66): além do resultado refeito, a situação de cada
// pendência anterior. A lista de pendências sai daí, não de uma lista nova: ela só diminui.
const ReanaliseSchema = ResultadoSchema.extend({
  situacao_pendencias: z.array(z.object({
    numero: z.number().int().describe('O número da pendência em <pendencias_anteriores>'),
    situacao: z.enum(['respondida', 'em_aberto', 'outra_pessoa']).describe('respondida: a pessoa respondeu, mesmo que em poucas palavras ou com um "não"; outra_pessoa: ela disse não saber ou ser de outra área; em_aberto: não houve resposta nenhuma'),
    quem_sabe: z.string().describe('Só para outra_pessoa: a área ou o cargo que saberia responder; vazio nos outros casos'),
  })).describe('Uma entrada para cada pendência anterior'),
});

export const SISTEMA_ANALISE = `Você é especialista em mapeamento de processos. Recebe a transcrição de uma entrevista por voz em que um entrevistador (IA) fez perguntas e uma pessoa explicou como um processo de trabalho funciona. A transcrição veio de reconhecimento de voz: corrija nomes e termos pelo contexto, mas não invente nada que não foi dito. A conversa foi ao vivo e os dois podiam falar ao mesmo tempo: falas marcadas "falou junto com o entrevistador" foram ditas por cima da fala dele e costumam ser correções ou informações novas, que valem mais que o que foi dito antes.

Produza, em português do Brasil:
1. "descricao": a descrição do processo para o cadastro, em HTML simples (só <p>, <ul>, <ol>, <li>, <strong> e <em>), com dois a cinco parágrafos: o que o processo é e para que serve; onde começa (o gatilho) e onde termina (o resultado); as áreas, os cargos e os sistemas envolvidos; as principais etapas em uma frase corrida (sem virar lista de passos: isso é o fluxograma); regras e prazos importantes. Frases completas, tom de documento, sem "o entrevistado disse".
2. "ficha": a estrutura do processo: objetivo, gatilho, resultado e as etapas na ordem em que acontecem, cada uma com responsável (cargo ou área), descrição curta, ferramentas, entradas, saídas, regras e exceções citadas (listas vazias quando nada foi dito); e as dificuldades relatadas.
3. "pendencias": o que faz falta para descrever ou desenhar o processo e que a própria pessoa entrevistada pode responder, escrito como perguntas para uma próxima conversa com ela (vazio se nada). No máximo ${MAX_PENDENCIAS}, as mais importantes primeiro. Regras:
   - Entra: uma etapa sem quem faz; um caminho de decisão que não foi explicado (o que acontece quando é negado, por exemplo); um prazo ou uma regra que a pessoa citou sem dizer qual é.
   - Pergunta respondida está fechada, mesmo que a resposta seja curta ou negativa ("não", "não tem prazo", "normalmente não dá problema", "é o próprio analista"). Não peça mais detalhe do que foi dado e não repita, com outras palavras, uma pergunta que o entrevistador já fez e a pessoa respondeu.
   - O que foi dito depois corrige o que foi dito antes: vale a resposta mais recente e mais clara, e isso não é contradição. Só há pendência por contradição quando as duas falas são igualmente vagas e nenhuma foi confirmada.
   - Curiosidade não é pendência: se o processo já dá para descrever sem a resposta, não pergunte.
   "pendencias_outra_pessoa": o que a pessoa disse não saber, não ter acesso ou ser de outra área ("isso é com o financeiro", "não sei como eles fazem"): a pergunta e "quem_sabe", a área ou o cargo que saberia responder (o que ela indicou ou o que fica claro na conversa). O que vai para uma lista não vai para a outra.
4. Fidelidade ao que foi dito: "dificuldades" só traz o que a pessoa relatou como problema, demora, retrabalho, dependência que a incomoda ou reclamação, nas palavras dela; volume de trabalho, picos e dependências descritos de forma neutra não são dificuldades. Se ela não relatou nenhuma, a lista fica vazia; a pergunta ("o que costuma dar problema?") só vai para as pendências se o entrevistador não chegou a fazê-la (se ele perguntou e ela disse que não costuma dar problema, está respondida). "responsavel" só com o cargo ou a área que a pessoa disse. O bloco <processo> (organização, área, descrição do cadastro e o pedido de quem convidou) serve para entender a conversa, não é fato relatado: não o use para preencher responsáveis, dificuldades ou etapas.
5. "entrevistado": a área ou o setor da pessoa e o que ela faz (cargo e atividades), só com o que ela contou sobre si na conversa ou com o que vier no bloco <pessoa> (dito por ela em outra conversa). Não deduza do processo nem do bloco <processo>; o que ela não disse fica vazio, e isso não vira pendência.
Ruído: a transcrição pode trazer falas soltas que não respondem à pergunta e não têm ligação com o processo (outra conversa perto do microfone, a pessoa falando com alguém ao lado, frase cortada). Ignore essas falas: não viram etapa, regra, dificuldade nem pendência.
A conversa pode ter uma continuação, em que a pessoa voltou para responder pontos que ficaram em aberto: integre essas respostas ao processo como as demais (elas valem mais que o que foi dito antes sobre o mesmo ponto). Nesse caso vem o bloco <pendencias_anteriores>: preencha "situacao_pendencias" com a situação de cada uma e não crie pendências novas; a lista de pendências sai dessa situação.
Ignore saudações, desvios de assunto e o que não descreve o processo. O nome da empresa se escreve INC (na transcrição pode aparecer "Ínqui", que é como se fala): escreva sempre INC. O que o entrevistador explicou por conta própria (por exemplo, o que é um sistema, depois de verificar) é conhecimento geral: use para entender a conversa, mas registre como fato do processo só o que a pessoa disse ou confirmou.`;

/**
 * O pedido da análise. `perfil`: o que a pessoa já contou sobre si em outra conversa (decisão 67). `anteriores`:
 * as pendências do resultado anterior, quando a pessoa voltou para completar (decisão 66), com as que ela escolheu
 * responder marcadas.
 */
export function montarPedidoAnalise(l: Pick<Linha, 'tema' | 'contexto' | 'turnos'>, perfil?: PerfilEntrevistado | null, anteriores?: { pendencias: string[]; escolhidas: string[] } | null) {
  const pessoa = perfil ? `<pessoa>\n${[perfil.area && `Área: ${perfil.area}`, perfil.funcao && `O que faz: ${perfil.funcao}`].filter(Boolean).join('\n')}\n</pessoa>\n\n` : '';
  const antes = anteriores?.pendencias.length
    ? `\n\n<pendencias_anteriores>\nA pessoa voltou à conversa para responder pontos em aberto. Estas eram as pendências; as marcadas com (escolhida) são as que ela veio responder.\n${anteriores.pendencias.map((p, i) => `${i + 1}. ${p}${anteriores.escolhidas.includes(p) ? ' (escolhida)' : ''}`).join('\n')}\n</pendencias_anteriores>`
    : '';
  return `<processo>\nTema da entrevista: ${l.tema}\n${l.contexto ? `Contexto: ${l.contexto}\n` : ''}</processo>\n\n${pessoa}<entrevista>\n${transcricaoDaConversa(l.turnos)}\n</entrevista>${antes}`;
}

const mesmaPergunta = (a: string, b: string) => a.trim().toLocaleLowerCase('pt-BR') === b.trim().toLocaleLowerCase('pt-BR');

/**
 * As pendências depois que a pessoa voltou para completar (decisão 66): saem das anteriores, pela situação que a
 * análise deu a cada uma. Respondida sai; o que ela disse não saber passa para outra pessoa; o resto continua.
 * Nenhuma pendência nova entra: a lista só diminui, e a entrevista não fica presa num ciclo de voltas.
 */
export function pendenciasDepoisDoComplemento(anterior: Pick<ResultadoEntrevista, 'pendencias' | 'pendencias_outra_pessoa'>, situacoes: { numero: number; situacao: 'respondida' | 'em_aberto' | 'outra_pessoa'; quem_sabe: string }[]) {
  const situacao = new Map(situacoes.map((x) => [x.numero, x]));
  const pendencias: string[] = [];
  const outra = [...(anterior.pendencias_outra_pessoa ?? [])];
  anterior.pendencias.forEach((p, i) => {
    const x = situacao.get(i + 1);
    if (x?.situacao === 'respondida') return;
    if (x?.situacao === 'outra_pessoa') { if (!outra.some((o) => mesmaPergunta(o.pergunta, p))) outra.push({ pergunta: p, quem_sabe: x.quem_sabe.trim() || 'Outra área' }); return; }
    pendencias.push(p); // em aberto, ou a análise não disse nada sobre ela
  });
  return { pendencias, pendencias_outra_pessoa: outra };
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
export async function encerrar(id: string, pessoa?: Pessoa | null) {
  const linha = await carregar(id);
  if (linha.status === 'convidada') throw new ErroApi(409, 'A entrevista ainda não começou.');
  // A pessoa encerra a sua conversa. O administrador tem acesso total (decisão 65): também encerra a conversa
  // pausada de outra pessoa e gera o resultado, menos enquanto ela está na ligação. Gestores só geram de novo
  // um resultado que falhou (erro ou processamento parado).
  const dono = !pessoa || !linha.entrevistado_id || linha.entrevistado_id === pessoa.id;
  if (!dono) {
    if (!ehGestor(pessoa)) exigirEntrevistado(linha, pessoa);
    if (linha.status === 'em_andamento') {
      if (pessoa.nivel !== 'admin') throw new ErroApi(403, 'Só a pessoa entrevistada ou um administrador encerra a conversa.', 'outra_pessoa');
      if (emLigacao(linha)) throw new ErroApi(409, MSG_EM_LIGACAO, 'em_ligacao');
    }
  }
  if (linha.status === 'concluida') return { status: 'concluida' as const };
  if (linha.status === 'processando' && Date.now() - new Date(linha.atualizado_em).getTime() < 3 * 60_000) return { status: 'processando' as const };
  const encerrado_em = linha.encerrado_em ?? agora();
  if (!linha.turnos.some((t) => t.quem === 'pessoa' && t.texto.trim())) {
    await salvar(id, { status: 'concluida', encerrado_em, resultado: null, em_ligacao_ate: null });
    return { status: 'concluida' as const };
  }
  await salvar(id, { status: 'processando', encerrado_em, erro: null, em_ligacao_ate: null });
  try {
    const inicio = Date.now();
    let uso: UsoIa | undefined;
    // A pessoa voltou para completar (decisão 66): a análise diz a situação de cada pendência anterior, e a
    // lista nova sai daí. Na primeira análise, a lista vem da IA, até o limite.
    const volta = complementoAberto(linha);
    const anterior = volta && linha.resultado ? linha.resultado : null;
    const conhecido = await perfilConhecido(linha.entrevistado_id).catch(() => null);
    const pedido = montarPedidoAnalise(linha, conhecido, anterior ? { pendencias: anterior.pendencias, escolhidas: volta!.pendencias } : null);
    const opcoes = { modelo: MODELO_ANALISE, maxTokens: 12000, esforco: 'medium' as const, aoUsar: (u: UsoIa) => { uso = u; } };
    const r = anterior ? await chamarEstruturado(ReanaliseSchema, SISTEMA_ANALISE, pedido, opcoes) : await chamarEstruturado(ResultadoSchema, SISTEMA_ANALISE, pedido, opcoes);
    const pendencias = anterior
      ? pendenciasDepoisDoComplemento(anterior, (r as z.infer<typeof ReanaliseSchema>).situacao_pendencias ?? [])
      : {
        pendencias: r.pendencias.map((p) => p.trim()).filter(Boolean).slice(0, MAX_PENDENCIAS),
        pendencias_outra_pessoa: r.pendencias_outra_pessoa.map((x) => ({ pergunta: x.pergunta.trim(), quem_sabe: x.quem_sabe.trim() || 'Outra área' })).filter((x) => x.pergunta),
      };
    // Quem é a pessoa (decisão 67): o que ela disse nesta conversa; se não disse, o que já tinha contado antes.
    const perfil = perfilDe({ entrevistado: r.entrevistado }) ?? perfilDe(anterior) ?? conhecido;
    const resultado: ResultadoEntrevista = { ...(perfil ? { entrevistado: perfil } : {}), descricao: limparHtml(r.descricao), ficha: r.ficha, ...pendencias };
    // O custo da análise entra nas métricas (relidas: o navegador pode ter salvado a versão final da conversa enquanto isso).
    const metricas = (await carregar(id)).metricas ?? {};
    // Soma às análises anteriores (completar a entrevista refaz o resultado; cada vez é cobrada; decisão 57).
    if (uso) {
      const ant = metricas.analise;
      metricas.analise = {
        modelo: uso.modelo, demora_ms: Date.now() - inicio,
        entrada_tokens: (ant?.entrada_tokens ?? 0) + uso.entrada, saida_tokens: (ant?.saida_tokens ?? 0) + uso.saida,
        cache_tokens: (ant?.cache_tokens ?? 0) + uso.cache_leitura, custo_usd: (ant?.custo_usd ?? 0) + custoAnalise(uso),
        vezes: (ant ? ant.vezes ?? 1 : 0) + 1,
      };
    }
    const c = complementoAberto(linha);
    await salvar(id, { status: 'concluida', resultado, metricas, ...(c ? { complemento: { ...c, concluido_em: agora() } } : {}) });
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

export async function urlDeUploadAudio(id: string, pessoa?: Pessoa | null) {
  exigirEntrevistado(await carregar(id), pessoa);
  const caminho = `${pastaDoAudio(id)}/conversa-${Date.now()}.webm`;
  const { data, error } = await supabase().storage.from(BUCKET).createSignedUploadUrl(caminho);
  if (error) throw error;
  return { caminho, url: data.signedUrl };
}

export async function registrarAudio(id: string, caminho: string, pessoa?: Pessoa | null) {
  if (!new RegExp(`^${pastaDoAudio(id)}/conversa-\\d+\\.webm$`).test(caminho)) throw new ErroApi(403, 'Arquivo inválido');
  exigirEntrevistado(await carregar(id), pessoa);
  await salvar(id, { audio_caminho: caminho });
  return { ok: true };
}
