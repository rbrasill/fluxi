-- Organização = empresa cujos processos são modelados. Uma conta (tenant) modela várias organizações.
-- Hierarquia: conta → organização → área → processo → gravações, fluxogramas e POPs.
create table if not exists public.organizacoes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  nome text not null check (length(trim(nome)) > 0),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create unique index if not exists organizacoes_tenant_nome on public.organizacoes (tenant_id, lower(nome));
alter table public.organizacoes enable row level security;

alter table public.areas add column if not exists organizacao_id uuid references public.organizacoes(id) on delete restrict;

-- Áreas existentes: vão para a organização com o nome da conta (INC Empreendimentos).
insert into public.organizacoes (tenant_id, nome)
select t.id, t.nome from public.tenants t where exists (select 1 from public.areas a where a.tenant_id = t.id and a.organizacao_id is null)
on conflict do nothing;
update public.areas a set organizacao_id = o.id from public.organizacoes o, public.tenants t
 where a.organizacao_id is null and t.id = a.tenant_id and o.tenant_id = t.id and lower(o.nome) = lower(t.nome);

alter table public.areas alter column organizacao_id set not null;
create index if not exists areas_organizacao on public.areas (organizacao_id);
-- Nome de área passa a ser único por organização (duas empresas podem ter "Comercial").
drop index if exists public.areas_tenant_nome;
create unique index if not exists areas_organizacao_nome on public.areas (organizacao_id, lower(nome));
