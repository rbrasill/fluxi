-- Login por código de e-mail (decisão 50, modelo do Atylux com as correções da auditoria de 06/11/2026).
-- Só entra quem um administrador cadastrou em `pessoas`, com e-mail do domínio da empresa. O código de
-- 6 dígitos nunca é guardado: só o hash. Tentativas, uso único e limites por IP/e-mail são atômicos,
-- feitos aqui no banco (o servidor da Vercel tem várias instâncias e nenhuma memória entre elas).

-- Quem pode entrar. A sessão carrega `versao_sessao`: sair, remover a pessoa ou mudar o nível incrementa
-- e derruba as sessões abertas.
create table if not exists public.pessoas (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  nome text not null,
  email text not null unique check (email = lower(btrim(email))),
  nivel text not null default 'comum' check (nivel in ('comum', 'gestor', 'admin')),
  versao_sessao int not null default 0,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists pessoas_tenant on public.pessoas (tenant_id, nome);

-- Código pendente: uma linha por e-mail; pedir outro substitui o anterior (depois da carência).
create table if not exists public.login_codigos (
  email text primary key,
  codigo_hash text not null,   -- hex do sha256 (e-mail + código + segredo); nunca o código
  expira_em timestamptz not null,
  tentativas smallint not null default 0,
  criado_em timestamptz not null default now()
);

-- Limites de pedidos por janela de tempo (por IP e por e-mail).
create table if not exists public.login_limites (
  chave text not null,         -- ex.: 'ip:203.0.113.7:solicitar', 'email:fulano@x:solicitar'
  janela timestamptz not null, -- início da janela
  contagem int not null default 0,
  primary key (chave, janela)
);

alter table public.pessoas enable row level security;
alter table public.login_codigos enable row level security;
alter table public.login_limites enable row level security;

-- Quem foi entrevistado (decisão 49: a entrevista será da pessoa convidada).
alter table public.entrevistas add column if not exists entrevistado_id uuid references public.pessoas(id) on delete set null;

-- Grava o código novo, a não ser que o anterior tenha sido pedido há menos de `p_carencia_s` segundos
-- (devolve false nesse caso). Aproveita para apagar códigos e janelas velhos.
create or replace function public.login_gravar_codigo(p_email text, p_hash text, p_validade_s int, p_carencia_s int)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  delete from login_codigos where expira_em < now() - interval '1 day';
  delete from login_limites where janela < now() - interval '1 day';
  insert into login_codigos (email, codigo_hash, expira_em, tentativas, criado_em)
  values (p_email, p_hash, now() + make_interval(secs => p_validade_s), 0, now())
  on conflict (email) do update
    set codigo_hash = excluded.codigo_hash, expira_em = excluded.expira_em, tentativas = 0, criado_em = now()
    where login_codigos.criado_em <= now() - make_interval(secs => p_carencia_s);
  return found;
end $$;

-- Consome uma tentativa ANTES de comparar, num comando só: com pedidos em paralelo, no máximo
-- `p_max` passam. Nenhuma linha de volta = código inexistente, vencido ou esgotado.
create or replace function public.login_consumir_tentativa(p_email text, p_max int)
returns table (codigo_hash text, tentativas smallint) language sql security definer set search_path = public as $$
  update login_codigos c set tentativas = c.tentativas + 1
   where c.email = p_email and c.tentativas < p_max and c.expira_em > now()
  returning c.codigo_hash, c.tentativas;
$$;

-- Uso único, mesmo em corrida: só um pedido consegue apagar a linha com o hash certo.
create or replace function public.login_usar_codigo(p_email text, p_hash text)
returns boolean language sql security definer set search_path = public as $$
  with apagado as (delete from login_codigos where email = p_email and codigo_hash = p_hash returning 1)
  select count(*) = 1 from apagado;
$$;

-- Conta um pedido na janela atual (de `p_janela_s` segundos) e devolve a contagem e o fim da janela.
create or replace function public.login_contar(p_chave text, p_janela_s int)
returns table (contagem int, fim timestamptz) language sql security definer set search_path = public as $$
  insert into login_limites as l (chave, janela, contagem)
  values (p_chave, to_timestamp(floor(extract(epoch from now()) / p_janela_s) * p_janela_s), 1)
  on conflict (chave, janela) do update set contagem = l.contagem + 1
  returning l.contagem, l.janela + make_interval(secs => p_janela_s);
$$;

-- Só o servidor (service_role) chama as funções; a API pública do Supabase não.
revoke all on function public.login_gravar_codigo(text, text, int, int) from public, anon, authenticated;
revoke all on function public.login_consumir_tentativa(text, int) from public, anon, authenticated;
revoke all on function public.login_usar_codigo(text, text) from public, anon, authenticated;
revoke all on function public.login_contar(text, int) from public, anon, authenticated;
grant execute on function public.login_gravar_codigo(text, text, int, int) to service_role;
grant execute on function public.login_consumir_tentativa(text, int) to service_role;
grant execute on function public.login_usar_codigo(text, text) to service_role;
grant execute on function public.login_contar(text, int) to service_role;
