import 'server-only';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { gerarCodigo } from '@/lib/codigo';
import { gerarDocx } from '@/lib/pop/docx';
import { conteudoVazio, type ConteudoPop, type Historico } from '@/lib/pop/schema';
import { ErroApi } from './http';
import { garantir as garantirProcesso, tocar } from './processos';
import { TENANT_PADRAO, supabase } from './supabase';

const BUCKET_GRAVACOES = 'gravacoes';
const CAMPOS = 'id, nome, codigo, identificacao, versao, status, fluxograma_id, gravacao_id, processo_id, criado_em, atualizado_em';

const hoje = () => new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });

export async function listar() {
  const { data, error } = await supabase().from('pops').select(CAMPOS).eq('tenant_id', TENANT_PADRAO).order('atualizado_em', { ascending: false });
  if (error) throw error;
  return data;
}

async function buscar(id: string) {
  const { data, error } = await supabase().from('pops').select(`${CAMPOS}, conteudo, historico`).eq('tenant_id', TENANT_PADRAO).eq('id', id).maybeSingle();
  if (error) throw error;
  if (!data) throw new ErroApi(404, 'POP não encontrado');
  return data as unknown as {
    id: string; nome: string; codigo: string; identificacao: string; versao: string; status: string;
    fluxograma_id: string | null; gravacao_id: string | null; processo_id: string | null; criado_em: string; atualizado_em: string;
    conteudo: ConteudoPop; historico: Historico[];
  };
}

/** POP com links temporários para as imagens dos passos. */
export async function obter(id: string) {
  const pop = await buscar(id);
  const caminhos = pop.conteudo.procedimentos.flatMap((p) => p.passos.map((s) => s.imagem_caminho)).filter(Boolean) as string[];
  let urls: Record<string, string> = {};
  if (caminhos.length) {
    const { data } = await supabase().storage.from(BUCKET_GRAVACOES).createSignedUrls(caminhos, 60 * 60 * 2);
    urls = Object.fromEntries((data ?? []).filter((d) => d.signedUrl).map((d) => [d.path, d.signedUrl]));
  }
  return { ...pop, imagens: urls };
}

export async function criar(p: { nome?: string; gravacao_id?: string; fluxograma_id?: string; processo_id?: string }) {
  let processoId = p.processo_id ?? null;
  if (processoId) await garantirProcesso(processoId);
  let conteudo = conteudoVazio();
  let nome = p.nome?.trim() || 'Novo POP';
  let codigo = gerarCodigo();

  if (p.fluxograma_id) {
    const { data } = await supabase().from('fluxogramas').select('codigo, nome, processo_id').eq('tenant_id', TENANT_PADRAO).eq('id', p.fluxograma_id).maybeSingle();
    if (!data) throw new ErroApi(404, 'Fluxograma não encontrado');
    codigo = data.codigo; // o código do processo é o mesmo do fluxograma
    if (!p.nome) nome = data.nome;
    processoId ??= data.processo_id;
  }

  if (p.gravacao_id) {
    const db = supabase();
    const [g, m] = await Promise.all([
      db.from('gravacoes').select('nome, processo_id').eq('tenant_id', TENANT_PADRAO).eq('id', p.gravacao_id).maybeSingle(),
      db.from('gravacao_marcacoes').select('id, tempo_ms, imagem_caminho, largura, altura, instrucao, instrucao_ia, incluir_no_pop')
        .eq('tenant_id', TENANT_PADRAO).eq('gravacao_id', p.gravacao_id).eq('incluir_no_pop', true).order('tempo_ms'),
    ]);
    if (!g.data) throw new ErroApi(404, 'Gravação não encontrada');
    if (!p.nome && !p.fluxograma_id) nome = g.data.nome;
    processoId ??= g.data.processo_id;
    const passos = (m.data ?? []).map((t) => ({
      texto: t.instrucao || t.instrucao_ia || '',
      imagem_caminho: t.imagem_caminho,
      imagem_largura: t.largura ?? undefined,
      imagem_altura: t.altura ?? undefined,
      marcacao_id: t.id,
    }));
    conteudo = { ...conteudo, procedimentos: [{ nome: 'Passo a passo no sistema', passos: passos.length ? passos : [{ texto: '' }] }] };
  }

  const { data, error } = await supabase().from('pops').insert({
    tenant_id: TENANT_PADRAO,
    nome,
    codigo,
    conteudo,
    historico: [{ data: hoje(), elaborado_por: '', revisao: 'Rev. 01' }],
    gravacao_id: p.gravacao_id ?? null,
    fluxograma_id: p.fluxograma_id ?? null,
    processo_id: processoId,
  }).select('id').single();
  if (error) throw error;
  await tocar(processoId);
  return data;
}

export async function atualizar(id: string, dados: Partial<{ nome: string; identificacao: string; versao: string; conteudo: ConteudoPop; historico: Historico[]; fluxograma_id: string | null; status: string; processo_id: string | null }>) {
  if (dados.processo_id) await garantirProcesso(dados.processo_id);
  const { data, error } = await supabase().from('pops').update({ ...dados, atualizado_em: new Date().toISOString() })
    .eq('tenant_id', TENANT_PADRAO).eq('id', id).select('id, atualizado_em').maybeSingle();
  if (error) throw error;
  if (!data) throw new ErroApi(404, 'POP não encontrado');
  return data;
}

export async function excluir(id: string) {
  const { error } = await supabase().from('pops').delete().eq('tenant_id', TENANT_PADRAO).eq('id', id);
  if (error) throw error;
  return { ok: true };
}

export async function docx(id: string, origem: string) {
  const pop = await buscar(id);
  const caminhos = [...new Set(pop.conteudo.procedimentos.flatMap((p) => p.passos.map((s) => s.imagem_caminho)).filter(Boolean) as string[])];
  const imagens = new Map<string, Uint8Array>();
  await Promise.all(caminhos.map(async (c) => {
    const { data } = await supabase().storage.from(BUCKET_GRAVACOES).download(c);
    if (data) imagens.set(c, new Uint8Array(await data.arrayBuffer()));
  }));
  const modelo = await readFile(path.join(process.cwd(), 'templates/pop/modelo-pop-v3.template.docx'));
  const arquivo = gerarDocx(modelo, {
    ...pop.conteudo,
    nome: pop.nome,
    codigo: pop.codigo,
    identificacao: pop.identificacao,
    versao: pop.versao,
    criado_em: pop.criado_em,
    historico: pop.historico,
    link_fluxograma: pop.fluxograma_id ? `${origem}/app/fluxogramas/${pop.fluxograma_id}` : null,
  }, imagens);
  const nomeArquivo = `POP ${pop.identificacao ? `${pop.identificacao} ` : ''}${pop.nome}`.replace(/[\\/:*?"<>|]+/g, ' ').trim() + '.docx';
  return { arquivo, nomeArquivo };
}
