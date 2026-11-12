import 'server-only';
import { z } from 'zod';
import { ErroApi } from './http';
import { normalizarEmail, revogarSessoes, type Nivel, type Pessoa } from './login';
import { TENANT_PADRAO, supabase } from './supabase';

// Pessoas e acessos (decisão 50): quem pode entrar no INCFlow. Só administradores cadastram, mudam o
// nível e removem. Mudar o nível ou remover derruba as sessões abertas da pessoa.

const NIVEIS = ['comum', 'gestor', 'admin'] as const;
export const PessoaNovaSchema = z.object({
  nome: z.string().trim().min(2, 'Informe o nome.').max(120),
  email: z.string().max(200),
  nivel: z.enum(NIVEIS),
});
export const PessoaAlteracaoSchema = z.object({
  nome: z.string().trim().min(2, 'Informe o nome.').max(120).optional(),
  nivel: z.enum(NIVEIS).optional(),
});

const CAMPOS = 'id, tenant_id, nome, email, nivel, versao_sessao, criado_em';
type Linha = Pessoa & { criado_em: string };

export async function listar() {
  const { data, error } = await supabase().from('pessoas').select(CAMPOS).eq('tenant_id', TENANT_PADRAO).order('nome');
  if (error) throw error;
  return ((data ?? []) as Linha[]).map(({ id, nome, email, nivel, criado_em }) => ({ id, nome, email, nivel, criado_em }));
}

async function carregar(id: string) {
  const { data, error } = await supabase().from('pessoas').select(CAMPOS).eq('tenant_id', TENANT_PADRAO).eq('id', id).maybeSingle();
  if (error) throw error;
  if (!data) throw new ErroApi(404, 'Pessoa não encontrada');
  return data as Linha;
}

async function admins() {
  const { data, error } = await supabase().from('pessoas').select('id').eq('tenant_id', TENANT_PADRAO).eq('nivel', 'admin');
  if (error) throw error;
  return (data ?? []) as { id: string }[];
}

export async function criar(d: z.infer<typeof PessoaNovaSchema>) {
  const email = normalizarEmail(d.email);
  const { data, error } = await supabase().from('pessoas')
    .insert({ tenant_id: TENANT_PADRAO, nome: d.nome.trim(), email, nivel: d.nivel, versao_sessao: 0 })
    .select('id').single();
  if (error) {
    if ((error as { code?: string }).code === '23505') throw new ErroApi(409, 'Já existe uma pessoa com esse e-mail.');
    throw error;
  }
  return { id: (data as { id: string }).id };
}

export async function alterar(id: string, d: z.infer<typeof PessoaAlteracaoSchema>, quem: Pessoa | null) {
  const p = await carregar(id);
  const novoNivel: Nivel = d.nivel ?? p.nivel;
  if (p.nivel === 'admin' && novoNivel !== 'admin') {
    if (quem?.id === p.id) throw new ErroApi(409, 'Você não pode tirar o seu próprio acesso de administrador.');
    if ((await admins()).length <= 1) throw new ErroApi(409, 'É preciso ter pelo menos um administrador.');
  }
  const { error } = await supabase().from('pessoas')
    .update({ ...(d.nome ? { nome: d.nome.trim() } : {}), nivel: novoNivel, atualizado_em: new Date().toISOString() })
    .eq('tenant_id', TENANT_PADRAO).eq('id', id);
  if (error) throw error;
  if (novoNivel !== p.nivel) await revogarSessoes(p); // o nível novo vale a partir do próximo login
  return { ok: true };
}

export async function excluir(id: string, quem: Pessoa | null) {
  const p = await carregar(id);
  if (quem?.id === p.id) throw new ErroApi(409, 'Você não pode remover a si mesmo.');
  if (p.nivel === 'admin' && (await admins()).length <= 1) throw new ErroApi(409, 'É preciso ter pelo menos um administrador.');
  // Sem a linha, as sessões dela param de valer na próxima chamada (as rotas conferem o cadastro).
  const { error } = await supabase().from('pessoas').delete().eq('tenant_id', TENANT_PADRAO).eq('id', id);
  if (error) throw error;
  return { ok: true };
}

/** Quem pode ser convidado para uma entrevista (gestores e administradores veem): só id, nome e e-mail. */
export async function convidaveis() {
  const { data, error } = await supabase().from('pessoas').select('id, nome, email').eq('tenant_id', TENANT_PADRAO).order('nome');
  if (error) throw error;
  return (data ?? []) as { id: string; nome: string; email: string }[];
}
