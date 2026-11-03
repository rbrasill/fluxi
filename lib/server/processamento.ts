import 'server-only';
import { ErroApi } from './http';
import { repararPartes } from './reparo';
import { TENANT_PADRAO, supabase } from './supabase';
import { consultarFalas, excluirRemota, iniciarDoStorage } from './transcricao';

// Transcrição da narração de uma gravação (AssemblyAI, um job por segmento), feita quando a pessoa
// pede (decisão 31): ela só serve para gerar o fluxograma do processo com IA. O andamento avança a
// cada consulta do navegador (GET), sem fila nem worker. A gravação não gera mais o POP: ele é
// escrito à mão, com as telas marcadas.

const mmss = (ms: number) => {
  const s = Math.floor(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

/** Erros do AssemblyAI mais comuns, em português; os outros seguem como vieram. */
function traduzirErro(erro: string) {
  if (/transcoding failed|file type .* unsupported/i.test(erro)) return 'o arquivo de áudio desta parte não pôde ser lido. Clique em "Tentar de novo": o Fluxi tenta consertar o arquivo antes de enviar.';
  if (/no spoken audio|does not appear to contain audio/i.test(erro)) return 'esta parte não tem áudio.';
  return erro;
}

async function gravacao(id: string) {
  const { data, error } = await supabase().from('gravacoes')
    .select('id, nome, status, processamento, processamento_erro')
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
  const g = await gravacao(id);
  if (g.status !== 'pronta') throw new ErroApi(409, 'Finalize a gravação antes de transcrever.');
  if (g.processamento === 'transcrevendo') return estado(id);
  const segs = await segmentos(id);
  if (!segs.length) throw new ErroApi(409, 'Esta gravação não tem áudio.');
  if (!(await marcar(id, { processamento: 'transcrevendo', processamento_erro: null }, g.processamento))) return estado(id);

  // Numa nova tentativa, reaproveita as partes já transcritas (não transcreve de novo).
  const faltam = segs.filter((s) => s.transcricao_status !== 'pronta');
  const db = supabase();
  let etapa = 'preparar';
  try {
    // Esquece as tentativas anteriores: uma consulta durante o conserto não deve ver o erro antigo.
    const { error } = await db.from('gravacao_segmentos').update({ transcricao_status: 'pendente', transcricao_id: null, falas: null })
      .eq('gravacao_id', id).neq('transcricao_status', 'pronta');
    if (error) throw error;
    // Partes gravadas antes da correção do gravador começam fora do cabeçalho: conserta antes de enviar.
    const consertadas = await repararPartes(id);
    if (consertadas) console.info(`gravação ${id}: ${consertadas} parte(s) consertada(s)`);
    etapa = 'enviar';
    await Promise.all(faltam.map(async (s) => {
      const transcricao_id = await iniciarDoStorage(s.caminho);
      const { error } = await db.from('gravacao_segmentos').update({ transcricao_id, transcricao_status: 'processando', falas: null })
        .eq('gravacao_id', id).eq('indice', s.indice);
      if (error) throw error;
    }));
  } catch (e) {
    console.error('transcrição', e);
    await marcar(id, { processamento: 'erro', processamento_erro: etapa === 'preparar' ? 'Não foi possível preparar o áudio das partes para a transcrição. Tente de novo.' : 'Não foi possível enviar o áudio para transcrição.' });
    throw e;
  }
  return avancar(id);
}

/** Consulta e, se possível, avança a transcrição. Com todas as partes prontas, a gravação fica "pronto". */
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
      await marcar(id, { processamento: 'erro', processamento_erro: `Falha na transcrição da parte ${s.indice + 1} (a partir de ${mmss(s.inicio_ms)}): ${traduzirErro(r.erro)}` });
      return estado(id);
    }
    await db.from('gravacao_segmentos').update({ transcricao_status: 'pronta', falas: r.falas }).eq('gravacao_id', id).eq('indice', s.indice);
    s.transcricao_status = 'pronta';
    await excluirRemota(s.transcricao_id);
  }
  if (segs.every((s) => s.transcricao_status === 'pronta')) await marcar(id, { processamento: 'pronto' }, 'transcrevendo');
  return estado(id);
}

export async function estado(id: string) {
  const g = await gravacao(id);
  const segs = await segmentos(id);
  const prontos = segs.filter((s) => s.transcricao_status === 'pronta').length;
  return {
    processamento: g.processamento as 'nenhum' | 'transcrevendo' | 'pronto' | 'erro',
    erro: g.processamento_erro,
    segmentos: { total: segs.length, prontos },
    transcrita: segs.length > 0 && prontos === segs.length,
  };
}
