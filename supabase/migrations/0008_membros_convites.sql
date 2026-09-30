-- Pessoas e acessos. Uma pessoa (auth.users) pode participar de várias contas (tenants):
-- a própria, onde é dona, e as em que foi convidada. Em cada conta, ela vê as organizações
-- que quem convidou liberou (ou todas, se for dona/admin).
create table if not exists public.membros (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  usuario_id uuid not null references auth.users(id) on delete cascade,
  papel text not null default 'membro' check (papel in ('dono', 'admin', 'membro')),
  todas_organizacoes boolean not null default false, -- dono/admin veem tudo; membro só o liberado
  criado_em timestamptz not null default now(),
  unique (tenant_id, usuario_id)
);
create index if not exists membros_usuario on public.membros (usuario_id);

-- Organizações que um membro comum pode ver/editar.
create table if not exists public.membro_organizacoes (
  membro_id uuid not null references public.membros(id) on delete cascade,
  organizacao_id uuid not null references public.organizacoes(id) on delete cascade,
  pode_editar boolean not null default true,
  primary key (membro_id, organizacao_id)
);

-- Convite por e-mail: quem convida escolhe o papel e as organizações liberadas.
create table if not exists public.convites (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  email text not null check (email = lower(email)),
  papel text not null default 'membro' check (papel in ('admin', 'membro')),
  organizacoes uuid[] not null default '{}',
  token text not null unique default encode(gen_random_bytes(24), 'hex'),
  convidado_por uuid references auth.users(id) on delete set null,
  expira_em timestamptz not null default now() + interval '7 days',
  aceito_em timestamptz,
  criado_em timestamptz not null default now()
);
create index if not exists convites_tenant on public.convites (tenant_id, criado_em desc);

alter table public.membros enable row level security;
alter table public.membro_organizacoes enable row level security;
alter table public.convites enable row level security;
