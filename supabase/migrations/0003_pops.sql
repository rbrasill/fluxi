-- Fluxi · POPs no Modelo POP v3 (docs/modelo-pop.md).
create table if not exists public.pops (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  fluxograma_id uuid references public.fluxogramas(id) on delete set null,
  gravacao_id uuid references public.gravacoes(id) on delete set null,
  codigo text not null check (codigo ~ '^[2-9A-HJKMNP-Z]{4}-[2-9A-HJKMNP-Z]{4}$'),
  identificacao text not null default '',
  nome text not null,
  versao text not null default '1.0',
  conteudo jsonb not null,
  historico jsonb not null default '[]',
  status text not null default 'rascunho' check (status in ('rascunho', 'publicado')),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists pops_tenant_atualizado on public.pops (tenant_id, atualizado_em desc);
alter table public.pops enable row level security;
