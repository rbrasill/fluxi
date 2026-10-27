import 'server-only';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { gerarCodigo } from '@/lib/codigo';
import { gerarDocx, type DadosPop } from '@/lib/pop/docx';
import { gerarPdf } from '@/lib/pop/pdf';
import type { Anotacoes } from '@/lib/marcacao/anotacoes';
import { conteudoVazio, type ConteudoPop, type Historico, type Passo } from '@/lib/pop/schema';
import { ErroApi } from './http';
import { garantir as garantirProcesso, tocar } from './processos';
import { TENANT_PADRAO, supabase } from './supabase';

const BUCKET_GRAVACOES = 'gravacoes';
const CAMPOS = 'id, nome, codigo, identificacao, versao, status, autor, fluxograma_id, gravacao_id, processo_id, criado_em, atualizado_em';

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
    id: string; nome: string; codigo: string; identificacao: string; versao: string; status: string; autor: string;
    fluxograma_id: string | null; gravacao_id: string | null; processo_id: string | null; criado_em: string; atualizado_em: string;
    conteudo: ConteudoPop; historico: Historico[];
  };
}

type MarcacaoDoPop = {
  id: string; gravacao_id: string; imagem_caminho: string; largura: number | null; altura: number | null;
  anotacoes: Anotacoes | null; imagem_anotada_caminho: string | null; anotada_largura: number | null; anotada_altura: number | null;
};

/** Telas marcadas usadas nos passos (as marcações desenhadas ficam na tela, não no POP). */
async function marcacoesDoPop(conteudo: ConteudoPop) {
  const ids = [...new Set(conteudo.procedimentos.flatMap((p) => p.passos.map((s) => s.marcacao_id)).filter(Boolean) as string[])];
  if (!ids.length) return new Map<string, MarcacaoDoPop>();
  const { data, error } = await supabase().from('gravacao_marcacoes')
    .select('id, gravacao_id, imagem_caminho, largura, altura, anotacoes, imagem_anotada_caminho, anotada_largura, anotada_altura')
    .eq('tenant_id', TENANT_PADRAO).in('id', ids);
  if (error) throw error;
  return new Map((data as MarcacaoDoPop[]).map((m) => [m.id, m]));
}

/** Imagem que vai para o POP: a versão marcada, se houver; senão o print original. */
function imagemFinal(s: Passo, m: Map<string, MarcacaoDoPop>) {
  const t = s.marcacao_id ? m.get(s.marcacao_id) : undefined;
  if (t?.imagem_anotada_caminho && t.imagem_caminho === s.imagem_caminho) {
    return { caminho: t.imagem_anotada_caminho, largura: t.anotada_largura ?? undefined, altura: t.anotada_altura ?? undefined };
  }
  return { caminho: s.imagem_caminho, largura: s.imagem_largura, altura: s.imagem_altura };
}

async function assinar(caminhos: string[]) {
  if (!caminhos.length) return {} as Record<string, string>;
  const { data } = await supabase().storage.from(BUCKET_GRAVACOES).createSignedUrls([...new Set(caminhos)], 60 * 60 * 2);
  return Object.fromEntries((data ?? []).filter((d) => d.signedUrl).map((d) => [d.path, d.signedUrl])) as Record<string, string>;
}

/**
 * POP com links temporários para as imagens dos passos. `imagens` (por imagem_caminho) já aponta
 * para a versão marcada; `telas` traz o original e as marcações, para reabrir o editor.
 */
export async function obter(id: string) {
  const pop = await buscar(id);
  const marcs = await marcacoesDoPop(pop.conteudo);
  const passos = pop.conteudo.procedimentos.flatMap((p) => p.passos).filter((s) => s.imagem_caminho);
  const finais = passos.map((s) => [s.imagem_caminho!, imagemFinal(s, marcs).caminho!] as const);
  const urls = await assinar([...finais.map(([, f]) => f), ...[...marcs.values()].map((m) => m.imagem_caminho)]);
  const imagens = Object.fromEntries(finais.filter(([, f]) => urls[f]).map(([orig, f]) => [orig, urls[f]]));
  const telas = Object.fromEntries([...marcs.values()].map((m) => [m.id, {
    gravacao_id: m.gravacao_id,
    imagem_url: urls[m.imagem_caminho] ?? null,
    largura: m.largura,
    altura: m.altura,
    anotacoes: m.anotacoes,
  }]));
  return { ...pop, imagens, telas };
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

  if (processoId && !conteudo.area) {
    const { data: pr } = await supabase().from('processos').select('area:areas(nome)').eq('id', processoId).maybeSingle();
    const area = (pr?.area as { nome?: string } | null)?.nome;
    if (area) conteudo = { ...conteudo, area };
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

export async function atualizar(id: string, dados: Partial<{ nome: string; identificacao: string; versao: string; autor: string; conteudo: ConteudoPop; historico: Historico[]; fluxograma_id: string | null; status: string; processo_id: string | null }>) {
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

/** Conteúdo e imagens do POP prontos para virar DOCX ou PDF. */
async function documento(id: string, origem: string) {
  const original = await buscar(id);
  // No documento vai a versão marcada de cada tela (com o tamanho dela, que muda com o recorte).
  const marcs = await marcacoesDoPop(original.conteudo);
  const conteudo: ConteudoPop = {
    ...original.conteudo,
    procedimentos: original.conteudo.procedimentos.map((p) => ({
      ...p,
      passos: p.passos.map((s) => {
        if (!s.imagem_caminho) return s;
        const f = imagemFinal(s, marcs);
        return { ...s, imagem_caminho: f.caminho, imagem_largura: f.largura, imagem_altura: f.altura };
      }),
    })),
  };
  const caminhos = [...new Set(conteudo.procedimentos.flatMap((p) => p.passos.map((s) => s.imagem_caminho)).filter(Boolean) as string[])];
  const imagens = new Map<string, Uint8Array>();
  await Promise.all(caminhos.map(async (c) => {
    const { data } = await supabase().storage.from(BUCKET_GRAVACOES).download(c);
    if (data) imagens.set(c, new Uint8Array(await data.arrayBuffer()));
  }));
  const dados: DadosPop = {
    ...conteudo,
    nome: original.nome,
    codigo: original.codigo,
    identificacao: original.identificacao,
    versao: original.versao,
    autor: original.autor,
    criado_em: original.criado_em,
    historico: original.historico,
    link_fluxograma: original.fluxograma_id ? `${origem}/app/fluxogramas/${original.fluxograma_id}` : null,
  };
  const nomeBase = `POP ${original.identificacao ? `${original.identificacao} ` : ''}${original.nome}`.replace(/[\\/:*?"<>|]+/g, ' ').trim();
  return { dados, imagens, nomeBase };
}

export async function docx(id: string, origem: string) {
  const { dados, imagens, nomeBase } = await documento(id, origem);
  const modelo = await readFile(path.join(process.cwd(), 'templates/pop/modelo-pop-v3.template.docx'));
  return { arquivo: gerarDocx(modelo, dados, imagens), nomeArquivo: `${nomeBase}.docx` };
}

export async function pdf(id: string, origem: string) {
  const { dados, imagens, nomeBase } = await documento(id, origem);
  return { arquivo: await gerarPdf(dados, imagens), nomeArquivo: `${nomeBase}.pdf` };
}
