import 'server-only';
import { createHash, timingSafeEqual } from 'node:crypto';
import { assinarSessao, lerSessao } from '@/lib/auth/sessao';
import { enviarEmail } from './carteiro';
import { ErroApi } from './http';
import { supabase } from './supabase';

// Login por código de e-mail (decisão 50; especificação do Atylux com as correções da auditoria de 06/11/2026).
// Sem senha: a pessoa digita o e-mail corporativo, recebe um código de 6 dígitos e entra por 6 horas.
// Só entra quem um administrador cadastrou em `pessoas`. O servidor gera o código, guarda só o hash, valida
// (tentativas, validade, uso único e limites, tudo atômico no banco) e emite a sessão; quem entrega o e-mail
// é o "carteiro" (AUTH_MAILER_URL, um workflow do Pipedream ou outro serviço), que não guarda nada.

const VALIDADE_S = 10 * 60;
const TENTATIVAS = 5;
const CARENCIA_S = 60;
// [máximo, janela em segundos]
const LIMITE_SOLICITAR_IP: [number, number] = [5, 10 * 60];
const LIMITE_SOLICITAR_EMAIL: [number, number] = [5, 60 * 60];
const LIMITE_VALIDAR_IP: [number, number] = [20, 10 * 60];
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const MENSAGEM_ENVIADO = 'Se o e-mail estiver cadastrado, o código chega em instantes.';

export type Nivel = 'comum' | 'gestor' | 'admin';
export type Pessoa = { id: string; tenant_id: string; nome: string; email: string; nivel: Nivel; versao_sessao: number };

export const segredo = () => process.env.INC_AUTH_SECRET || '';
export const dominio = () => (process.env.INC_AUTH_DOMINIO || '@meuinc.com.br').toLowerCase();
export const emProducao = () => process.env.NODE_ENV === 'production';

function exigirConfigurado() {
  if (!segredo()) throw new ErroApi(503, 'O login ainda não está configurado (falta INC_AUTH_SECRET).');
}

export function normalizarEmail(bruto: unknown) {
  const email = String(bruto ?? '').trim().toLowerCase();
  if (!EMAIL.test(email)) throw new ErroApi(400, 'Informe um e-mail válido.');
  if (!email.endsWith(dominio())) throw new ErroApi(403, `Acesso restrito a e-mails ${dominio()}.`);
  return email;
}

/** O e-mail entra no hash: o código de uma pessoa não vale para outra. */
export const hashDoCodigo = (email: string, codigo: string) => createHash('sha256').update(`${email}:${codigo}:${segredo()}`).digest('hex');

const iguais = (a: string, b: string) => {
  const x = Buffer.from(a, 'hex'), y = Buffer.from(b, 'hex');
  return x.length > 0 && x.length === y.length && timingSafeEqual(x, y);
};

/** Conta o pedido na janela; passou do máximo: 429 com o tempo até a janela acabar. */
async function limitar(chave: string, [maximo, janela_s]: [number, number], mensagem = 'Muitas tentativas. Aguarde um pouco e tente de novo.') {
  const { data, error } = await supabase().rpc('login_contar', { p_chave: chave, p_janela_s: janela_s });
  if (error) throw error;
  const linha = (Array.isArray(data) ? data[0] : data) as { contagem: number; fim: string } | null;
  if (linha && linha.contagem > maximo) {
    const espera = Math.max(1, Math.ceil((new Date(linha.fim).getTime() - Date.now()) / 1000));
    throw new ErroApi(429, mensagem, 'limite', { 'Retry-After': String(espera) });
  }
}

export async function pessoaPorEmail(email: string): Promise<Pessoa | null> {
  const { data, error } = await supabase().from('pessoas').select('id, tenant_id, nome, email, nivel, versao_sessao').eq('email', email).maybeSingle();
  if (error) throw error;
  return (data as Pessoa | null) ?? null;
}

/** "nome.sobrenome@..." → "Nome Sobrenome" (quando o cadastro não tem nome). */
export const nomeDoEmail = (email: string) =>
  email.split('@')[0].split(/[._-]+/).filter(Boolean).map((p) => p[0].toUpperCase() + p.slice(1)).join(' ');

// O código vai pelo carteiro (lib/server/carteiro.ts). Sem carteiro, só em desenvolvimento, fica no log do servidor.
const chamarCarteiro = (email: string, nome: string, codigo: string) => enviarEmail({ tipo: 'codigo', email, nome, codigo });

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Passo 1: gera o código e manda por e-mail. A resposta é a mesma para e-mail cadastrado ou não. */
export async function solicitarCodigo(emailBruto: unknown, ip: string) {
  exigirConfigurado();
  if (emProducao() && !process.env.AUTH_MAILER_URL) throw new ErroApi(503, 'O envio do código por e-mail ainda não está configurado.');
  const email = normalizarEmail(emailBruto);
  await limitar(`ip:${ip}:solicitar`, LIMITE_SOLICITAR_IP);
  await limitar(`email:${email}:solicitar`, LIMITE_SOLICITAR_EMAIL);
  const pessoa = await pessoaPorEmail(email);
  if (!pessoa) {
    // Não cadastrado: nada é gerado nem enviado, mas a resposta (e a carência, e o tempo) é igual à de quem é.
    await limitar(`carencia:${email}`, [1, CARENCIA_S], `Um código já foi enviado há pouco. Aguarde ${CARENCIA_S}s para pedir outro.`);
    await esperar(400 + Math.random() * 600);
    return { ok: true, message: MENSAGEM_ENVIADO };
  }
  const codigo = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000).padStart(6, '0');
  const { data: gravou, error } = await supabase().rpc('login_gravar_codigo', { p_email: email, p_hash: hashDoCodigo(email, codigo), p_validade_s: VALIDADE_S, p_carencia_s: CARENCIA_S });
  if (error) throw error;
  if (!gravou) throw new ErroApi(429, `Um código já foi enviado há pouco. Aguarde ${CARENCIA_S}s para pedir outro.`, 'carencia', { 'Retry-After': String(CARENCIA_S) });
  try {
    await chamarCarteiro(email, pessoa.nome || nomeDoEmail(email), codigo);
  } catch (e) {
    // Código que não chegou não pode ficar valendo.
    await supabase().from('login_codigos').delete().eq('email', email);
    console.error('[login] falha ao enviar o código:', e instanceof Error ? e.message : e);
    throw new ErroApi(502, 'Não foi possível enviar o e-mail agora.');
  }
  return { ok: true, message: MENSAGEM_ENVIADO };
}

const apagarCodigo = (email: string) => supabase().from('login_codigos').delete().eq('email', email).then(({ error }) => { if (error) throw error; });

/** Passo 2: confere o código e devolve o token da sessão. */
export async function validarCodigo(emailBruto: unknown, codigoBruto: unknown, ip: string) {
  exigirConfigurado();
  const email = normalizarEmail(emailBruto);
  const codigo = String(codigoBruto ?? '').trim();
  if (!/^\d{6}$/.test(codigo)) throw new ErroApi(400, 'O código tem 6 dígitos.');
  await limitar(`ip:${ip}:validar`, LIMITE_VALIDAR_IP);
  // A tentativa é consumida antes da comparação, num comando só (com pedidos em paralelo, no máximo 5 passam).
  const { data, error } = await supabase().rpc('login_consumir_tentativa', { p_email: email, p_max: TENTATIVAS });
  if (error) throw error;
  const linha = (Array.isArray(data) ? data[0] : data) as { codigo_hash: string; tentativas: number } | undefined;
  if (!linha) {
    await apagarCodigo(email);
    throw new ErroApi(400, 'Código expirado ou inválido. Peça um novo.');
  }
  if (!iguais(hashDoCodigo(email, codigo), linha.codigo_hash)) {
    const restantes = TENTATIVAS - linha.tentativas;
    if (restantes <= 0) {
      await apagarCodigo(email);
      throw new ErroApi(401, 'Muitas tentativas. Peça um novo código.');
    }
    throw new ErroApi(401, `Código incorreto. ${restantes} ${restantes === 1 ? 'tentativa restante' : 'tentativas restantes'}.`);
  }
  // Uso único mesmo em corrida: só emite a sessão quem conseguiu apagar a linha.
  const { data: usado, error: erroUso } = await supabase().rpc('login_usar_codigo', { p_email: email, p_hash: linha.codigo_hash });
  if (erroUso) throw erroUso;
  const pessoa = usado ? await pessoaPorEmail(email) : null;
  if (!pessoa) throw new ErroApi(400, 'Código expirado ou inválido. Peça um novo.');
  return { token: await assinarSessao(email, pessoa.versao_sessao, segredo()) };
}

/** A pessoa do token: assinatura e validade, ainda cadastrada e sessão não revogada (versão). */
export async function pessoaDaSessao(token: string | null | undefined): Promise<Pessoa | null> {
  const s = await lerSessao(token, segredo());
  if (!s) return null;
  const p = await pessoaPorEmail(s.email);
  if (!p || s.versao < p.versao_sessao) return null;
  return p;
}

/** Revoga as sessões da pessoa (sair, remoção, mudança de nível): os tokens com a versão antiga param de valer. */
export async function revogarSessoes(pessoa: Pick<Pessoa, 'id' | 'versao_sessao'>) {
  const { error } = await supabase().from('pessoas').update({ versao_sessao: pessoa.versao_sessao + 1, atualizado_em: new Date().toISOString() }).eq('id', pessoa.id);
  if (error) throw error;
}
