import 'server-only';
import { z } from 'zod';
import { ErroApi } from './http';
import type { Pessoa } from './login';
import { TENANT_PADRAO, supabase } from './supabase';

// Meu perfil (decisão 84): o que a própria pessoa conta sobre si (cargo, área, gestor direto e o que faz) e os
// processos em que ela participa. Cada um vê e muda só o próprio perfil; o nível de acesso e o e-mail continuam
// com os administradores, em Pessoas e acessos.

export const PerfilAlteracaoSchema = z.object({
  nome: z.string().trim().min(2, 'Informe o nome.').max(120).optional(),
  cargo: z.string().trim().max(120).optional(),
  area_id: z.string().uuid().nullable().optional(),
  gestor: z.string().trim().max(120).optional(),
  atividades: z.string().trim().max(2000, 'Texto grande demais: resuma em até 2.000 caracteres.').optional(),
});

/** As colunas do perfil vêm da migração 0023. Antes dela, o banco responde "coluna não existe". */
const semMigracao = (e: unknown) => ['42703', 'PGRST204'].includes((e as { code?: string } | null)?.code ?? '');
const FALTA_MIGRACAO = 'O perfil ainda não está disponível: falta aplicar a migração 0023 (perfil) no banco.';

type Area = { id: string; nome: string; organizacao: { id: string; nome: string } | null };
export type ParticipacaoNoProcesso = { processo_id: string; nome: string; area: string | null; papeis: 'entrevistado'[]; quando: string; entrevista_id: string };

async function areasDoTenant() {
  const { data, error } = await supabase().from('areas').select('id, nome, organizacao:organizacoes(id, nome)').eq('tenant_id', TENANT_PADRAO).order('nome');
  if (error) throw error;
  return (data ?? []) as unknown as Area[];
}

/** Os processos em que a pessoa foi entrevistada pela Maia (entrevistas ativas, que já começaram), um por processo. */
async function participacoes(pessoaId: string): Promise<ParticipacaoNoProcesso[]> {
  const { data, error } = await supabase().from('entrevistas')
    .select('id, status, iniciada_em, encerrado_em, criado_em, processo:processos(id, nome, arquivado_em, area:areas(nome))')
    .eq('tenant_id', TENANT_PADRAO).eq('entrevistado_id', pessoaId).is('arquivado_em', null).neq('status', 'convidada')
    .order('criado_em', { ascending: false });
  if (error) { if (semMigracao(error)) return []; throw error; }
  const vistos = new Set<string>();
  const lista: ParticipacaoNoProcesso[] = [];
  for (const e of (data ?? []) as unknown as { id: string; iniciada_em: string | null; encerrado_em: string | null; criado_em: string; processo: { id: string; nome: string; arquivado_em: string | null; area: { nome: string } | null } | null }[]) {
    if (!e.processo || e.processo.arquivado_em || vistos.has(e.processo.id)) continue;
    vistos.add(e.processo.id);
    lista.push({ processo_id: e.processo.id, nome: e.processo.nome, area: e.processo.area?.nome ?? null, papeis: ['entrevistado'], quando: e.encerrado_em ?? e.iniciada_em ?? e.criado_em, entrevista_id: e.id });
  }
  return lista;
}

export async function obter(pessoa: Pessoa | null) {
  if (!pessoa) throw new ErroApi(404, 'O perfil existe para quem entra com login.');
  const [linha, areas, processos] = await Promise.all([
    supabase().from('pessoas').select('cargo, area_id, gestor, atividades').eq('tenant_id', TENANT_PADRAO).eq('id', pessoa.id).maybeSingle(),
    areasDoTenant(),
    participacoes(pessoa.id),
  ]);
  if (linha.error && !semMigracao(linha.error)) throw linha.error;
  const d = (linha.data ?? {}) as { cargo?: string; area_id?: string | null; gestor?: string; atividades?: string };
  const area = areas.find((a) => a.id === d.area_id) ?? null;
  const organizacoes = [...new Map(areas.filter((a) => a.organizacao).map((a) => [a.organizacao!.id, a.organizacao!.nome])).values()];
  return {
    id: pessoa.id, nome: pessoa.nome, email: pessoa.email, nivel: pessoa.nivel,
    cargo: d.cargo ?? '', area_id: area?.id ?? null, gestor: d.gestor ?? '', atividades: d.atividades ?? '',
    // A organização da área escolhida; sem área, a única organização cadastrada (quando só há uma).
    organizacao: area?.organizacao?.nome ?? (organizacoes.length === 1 ? organizacoes[0] : null),
    areas: areas.map((a) => ({ id: a.id, nome: a.nome, organizacao: a.organizacao?.nome ?? null })),
    processos,
    disponivel: !linha.error, // false: falta a migração 0023 (dá para ver, não para salvar)
  };
}

export async function alterar(pessoa: Pessoa | null, d: z.infer<typeof PerfilAlteracaoSchema>) {
  if (!pessoa) throw new ErroApi(404, 'O perfil existe para quem entra com login.');
  if (d.area_id) {
    const { data, error } = await supabase().from('areas').select('id').eq('tenant_id', TENANT_PADRAO).eq('id', d.area_id).maybeSingle();
    if (error) throw error;
    if (!data) throw new ErroApi(400, 'Área não encontrada.');
  }
  const dados = Object.fromEntries(Object.entries(d).filter(([, v]) => v !== undefined));
  if (!Object.keys(dados).length) return { ok: true };
  const { error } = await supabase().from('pessoas').update({ ...dados, atualizado_em: new Date().toISOString() }).eq('tenant_id', TENANT_PADRAO).eq('id', pessoa.id);
  if (error) { if (semMigracao(error)) throw new ErroApi(503, FALTA_MIGRACAO); throw error; }
  return { ok: true };
}

/** Para a Maia (decisão 84): a área e o que a pessoa faz, como ela escreveu no perfil. Sem perfil preenchido, null. */
export async function perfilParaAMaia(pessoaId: string): Promise<{ area: string; funcao: string } | null> {
  const { data, error } = await supabase().from('pessoas').select('cargo, atividades, area:areas(nome)').eq('tenant_id', TENANT_PADRAO).eq('id', pessoaId).maybeSingle();
  if (error || !data) return null; // sem a migração 0023, a Maia segue como antes
  const d = data as unknown as { cargo: string; atividades: string; area: { nome: string } | null };
  const area = d.area?.nome?.trim() ?? '';
  const funcao = [d.cargo?.trim(), d.atividades?.trim()].filter(Boolean).join('. ');
  return area || funcao ? { area, funcao } : null;
}
