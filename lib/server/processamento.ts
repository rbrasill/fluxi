import 'server-only';
import { gerarXml } from '@/lib/fluxo/gerar-xml';
import type { ConteudoPop } from '@/lib/pop/schema';
import { CUSTO, debitar, saldo } from './creditos';
import * as fluxogramas from './fluxogramas';
import { ErroApi } from './http';
import { analisarGravacao } from './ia';
import * as pops from './pops';
import { TENANT_PADRAO, supabase } from './supabase';
import { consultarFalas, excluirRemota, formatarFalas, iniciarDoStorage, type Fala } from './transcricao';

// Gravação → transcrição (AssemblyAI, um job por segmento) → Claude (POP + fluxograma numa chamada só).
// O andamento avança a cada consulta do navegador (GET), sem fila nem worker: cada passo é curto,
// exceto a análise, que roda numa única requisição com trava atômica no banco.

export const CUSTO_TOTAL = CUSTO.transcricao + CUSTO.fluxograma + CUSTO.pop;

const mmss = (ms: number) => {
  const s = Math.floor(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

async function gravacao(id: string) {
  const { data, error } = await supabase().from('gravacoes')
    .select('id, nome, status, processamento, processamento_erro, pop_id, fluxograma_id, processo_id')
    .eq('tenant_id', TENANT_PADRAO).eq('id', id).maybeSingle();
  if (error) throw error;
  if (!data) throw new ErroApi(404, 'Gravação não encontrada');
  return data;
}

async function marcar(id: string, dados: Record<string, unknown>, deEstado?: string) {
  let q = supabase().from('gravacoes').update({ ...dados, atualizado_em: new Date().toISOString() }).eq('tenant_id', TENANT_PADRAO).eq('id', id);
  if (deEstado) q = q.eq('processamento', deEstado);
  const { data, error } = await q.select('id');
  if (error) throw error;
  return (data ?? []).length > 0;
}

const segmentos = async (id: string) => {
  const { data, error } = await supabase().from('gravacao_segmentos')
    .select('indice, caminho, inicio_ms, transcricao_id, transcricao_status, falas')
    .eq('tenant_id', TENANT_PADRAO).eq('gravacao_id', id).order('indice');
  if (error) throw error;
  return data;
};

export async function iniciar(id: string) {
  if (!process.env.ASSEMBLYAI_API_KEY) throw new ErroApi(503, 'A transcrição ainda não está configurada (falta ASSEMBLYAI_API_KEY).');
  if (!process.env.ANTHROPIC_API_KEY) throw new ErroApi(503, 'A IA ainda não está configurada (falta ANTHROPIC_API_KEY).');
  const g = await gravacao(id);
  if (g.status !== 'pronta') throw new ErroApi(409, 'Finalize a gravação antes de gerar o POP.');
  if (g.processamento === 'transcrevendo' || g.processamento === 'analisando') return estado(id);
  if ((await saldo()) < CUSTO_TOTAL) throw new ErroApi(402, `São necessários ${CUSTO_TOTAL} créditos de IA. Você pode continuar criando o POP manualmente.`, 'sem_creditos');
  const segs = await segmentos(id);
  if (!segs.length) throw new ErroApi(409, 'Esta gravação não tem áudio.');
  if (!(await marcar(id, { processamento: 'transcrevendo', processamento_erro: null }, g.processamento))) return estado(id);

  try {
    // Numa nova tentativa, reaproveita as partes já transcritas (não paga de novo).
    const faltam = segs.filter((s) => s.transcricao_status !== 'pronta');
    if (faltam.length) await debitar('transcricao', { gravacao_id: id });
    const db = supabase();
    await Promise.all(faltam.map(async (s) => {
      const transcricao_id = await iniciarDoStorage(s.caminho);
      const { error } = await db.from('gravacao_segmentos').update({ transcricao_id, transcricao_status: 'processando', falas: null })
        .eq('gravacao_id', id).eq('indice', s.indice);
      if (error) throw error;
    }));
  } catch (e) {
    await marcar(id, { processamento: 'erro', processamento_erro: 'Não foi possível enviar o áudio para transcrição.' });
    throw e;
  }
  return estado(id);
}

/** Consulta e, se possível, avança o processamento. */
export async function avancar(id: string) {
  const g = await gravacao(id);
  if (g.processamento !== 'transcrevendo') return estado(id);

  const segs = await segmentos(id);
  const db = supabase();
  for (const s of segs) {
    if (s.transcricao_status !== 'processando' || !s.transcricao_id) continue;
    const r = await consultarFalas(s.transcricao_id, s.inicio_ms);
    if (r.status === 'processando') continue;
    if (r.status === 'erro') {
      await marcar(id, { processamento: 'erro', processamento_erro: `Falha na transcrição: ${r.erro}` });
      return estado(id);
    }
    await db.from('gravacao_segmentos').update({ transcricao_status: 'pronta', falas: r.falas }).eq('gravacao_id', id).eq('indice', s.indice);
    s.transcricao_status = 'pronta';
    s.falas = r.falas;
    await excluirRemota(s.transcricao_id);
  }
  if (segs.some((s) => s.transcricao_status !== 'pronta')) return estado(id);

  // Trava: só uma requisição faz a análise.
  if (!(await marcar(id, { processamento: 'analisando' }, 'transcrevendo'))) return estado(id);
  try {
    await analisar(id, g.nome, g.processo_id, segs.flatMap((s) => (s.falas as Fala[] | null) ?? []));
  } catch (e) {
    console.error('processamento', e);
    const msg = e instanceof ErroApi ? e.message : 'Erro ao analisar a gravação. Tente novamente.';
    await marcar(id, { processamento: 'erro', processamento_erro: msg });
  }
  return estado(id);
}

async function analisar(id: string, nome: string, processoId: string | null, falas: Fala[]) {
  const db = supabase();
  const { data: marcs, error } = await db.from('gravacao_marcacoes')
    .select('id, tempo_ms, imagem_caminho, largura, altura, instrucao')
    .eq('tenant_id', TENANT_PADRAO).eq('gravacao_id', id).eq('incluir_no_pop', true).order('tempo_ms');
  if (error) throw error;
  const telas = marcs ?? [];

  // Ids curtos (T1, T2…) economizam tokens e evitam erro da IA ao copiar UUID.
  const porId = new Map(telas.map((t, i) => [`T${i + 1}`, t]));
  const transcricao = formatarFalas(falas, true) || '(sem fala na gravação)';
  const analise = await analisarGravacao(transcricao, [...porId].map(([k, t]) => ({ id: k, momento: mmss(t.tempo_ms), instrucao: t.instrucao })));

  const fluxo = await fluxogramas.criar({ nome, xml: gerarXml(analise.fluxo), origem: 'ia', schema: analise.fluxo, processo_id: processoId });
  await debitar('fluxograma', { gravacao_id: id, fluxograma_id: fluxo.id });

  const usadas = new Set<string>();
  const conteudo: ConteudoPop = {
    area: analise.pop.area,
    executor: analise.pop.executor,
    objetivo: analise.pop.objetivo,
    envolvidos: analise.pop.envolvidos,
    procedimentos: analise.pop.procedimentos.map((p) => ({
      nome: p.nome,
      passos: p.passos.map((s) => {
        const t = s.tela && !usadas.has(s.tela) ? porId.get(s.tela) : undefined;
        if (!t) return { texto: s.texto };
        usadas.add(s.tela!);
        return { texto: s.texto, imagem_caminho: t.imagem_caminho, imagem_largura: t.largura ?? undefined, imagem_altura: t.altura ?? undefined, marcacao_id: t.id };
      }),
    })),
  };
  // Tela que a IA esqueceu não se perde: vai para o fim.
  const esquecidas = [...porId].filter(([k]) => !usadas.has(k));
  if (esquecidas.length) {
    const instr = new Map(analise.telas.map((t) => [t.id, t.instrucao]));
    conteudo.procedimentos.push({
      nome: 'Telas marcadas',
      passos: esquecidas.map(([k, t]) => ({ texto: t.instrucao || instr.get(k) || '', imagem_caminho: t.imagem_caminho, imagem_largura: t.largura ?? undefined, imagem_altura: t.altura ?? undefined, marcacao_id: t.id })),
    });
  }

  const pop = await pops.criar({ gravacao_id: id, fluxograma_id: fluxo.id });
  await pops.atualizar(pop.id, { conteudo });
  await debitar('pop', { gravacao_id: id, pop_id: pop.id });

  await Promise.all(analise.telas.map((t) => {
    const m = porId.get(t.id);
    return m ? db.from('gravacao_marcacoes').update({ instrucao_ia: t.instrucao }).eq('id', m.id) : null;
  }));
  await marcar(id, { processamento: 'pronto', pop_id: pop.id, fluxograma_id: fluxo.id });
}

export async function estado(id: string) {
  const g = await gravacao(id);
  const segs = await segmentos(id);
  return {
    processamento: g.processamento as 'nenhum' | 'transcrevendo' | 'analisando' | 'pronto' | 'erro',
    erro: g.processamento_erro,
    pop_id: g.pop_id,
    fluxograma_id: g.fluxograma_id,
    segmentos: { total: segs.length, prontos: segs.filter((s) => s.transcricao_status === 'pronta').length },
    custo: CUSTO_TOTAL,
  };
}
