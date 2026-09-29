-- Fluxi · MVP: empresas (tenants) e fluxogramas. Sem login por enquanto:
-- o acesso é só pela API (chave service_role no servidor); RLS ligado e sem
-- políticas, então as chaves públicas (anon) não leem nada.

create table if not exists public.tenants (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  slug text not null unique,
  creditos_ia integer not null default 20 check (creditos_ia >= 0),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table if not exists public.fluxogramas (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  codigo text not null check (codigo ~ '^[2-9A-HJKMNP-Z]{4}-[2-9A-HJKMNP-Z]{4}$'),
  nome text not null,
  xml text not null default '',
  schema jsonb,
  origem text not null default 'manual' check (origem in ('manual', 'ia', 'modelo')),
  miniatura text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (tenant_id, codigo)
);
create index if not exists fluxogramas_tenant_atualizado on public.fluxogramas (tenant_id, atualizado_em desc);

-- Consumo de créditos de IA (auditoria).
create table if not exists public.uso_ia (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  tipo text not null check (tipo in ('fluxograma', 'transcricao')),
  creditos integer not null,
  detalhes jsonb,
  criado_em timestamptz not null default now()
);
create index if not exists uso_ia_tenant on public.uso_ia (tenant_id, criado_em desc);

alter table public.tenants enable row level security;
alter table public.fluxogramas enable row level security;
alter table public.uso_ia enable row level security;

-- Debita créditos de forma atômica; retorna o saldo ou null se não houver saldo.
create or replace function public.debitar_creditos(p_tenant uuid, p_qtd integer, p_tipo text, p_detalhes jsonb default null)
returns integer language plpgsql security definer set search_path = public as $$
declare saldo integer;
begin
  update tenants set creditos_ia = creditos_ia - p_qtd, atualizado_em = now()
   where id = p_tenant and creditos_ia >= p_qtd
   returning creditos_ia into saldo;
  if saldo is null then return null; end if;
  insert into uso_ia (tenant_id, tipo, creditos, detalhes) values (p_tenant, p_tipo, p_qtd, p_detalhes);
  return saldo;
end $$;
revoke all on function public.debitar_creditos from public, anon, authenticated;

-- Tenant padrão enquanto não há login.
insert into public.tenants (id, nome, slug)
values ('00000000-0000-4000-8000-000000000001', 'INC Empreendimentos', 'inc')
on conflict (id) do nothing;

-- Bucket privado para áudios enviados para transcrição.
insert into storage.buckets (id, name, public) values ('gravacoes', 'gravacoes', false)
on conflict (id) do nothing;
