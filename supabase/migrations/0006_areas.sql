-- Área = primeiro nível de navegação (e, com o login, de acesso). Todo processo pertence a uma área.
create table if not exists public.areas (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  nome text not null check (length(trim(nome)) > 0),
  descricao text not null default '',
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create unique index if not exists areas_tenant_nome on public.areas (tenant_id, lower(nome));
alter table public.areas enable row level security;

alter table public.processos add column if not exists area_id uuid references public.areas(id) on delete restrict;

-- Processos existentes: a área digitada vira uma área de verdade; sem área, vão para "Geral".
insert into public.areas (tenant_id, nome)
select distinct tenant_id, coalesce(nullif(trim(area), ''), 'Geral') from public.processos where area_id is null
on conflict do nothing;
update public.processos p set area_id = a.id from public.areas a
 where p.area_id is null and a.tenant_id = p.tenant_id and lower(a.nome) = lower(coalesce(nullif(trim(p.area), ''), 'Geral'));

alter table public.processos alter column area_id set not null;
create index if not exists processos_area on public.processos (area_id);
-- A coluna texto "area" fica só por compatibilidade com a versão anterior; o app usa area_id.
