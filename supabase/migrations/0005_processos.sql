-- Processo = pasta: agrupa fluxogramas, gravações (com transcrição) e POPs do mesmo processo.
create table if not exists public.processos (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  codigo text not null check (codigo ~ '^[2-9A-HJKMNP-Z]{4}-[2-9A-HJKMNP-Z]{4}$'),
  nome text not null,
  area text not null default '',
  descricao text not null default '',
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (tenant_id, codigo)
);
create index if not exists processos_tenant_atualizado on public.processos (tenant_id, atualizado_em desc);
alter table public.processos enable row level security;

alter table public.fluxogramas add column if not exists processo_id uuid references public.processos(id) on delete set null;
alter table public.gravacoes  add column if not exists processo_id uuid references public.processos(id) on delete set null;
alter table public.pops       add column if not exists processo_id uuid references public.processos(id) on delete set null;
create index if not exists fluxogramas_processo on public.fluxogramas (processo_id);
create index if not exists gravacoes_processo on public.gravacoes (processo_id);
create index if not exists pops_processo on public.pops (processo_id);

-- Itens que já existiam: um processo por fluxograma (mesmo código e nome), com os POPs e gravações ligados a ele.
insert into public.processos (tenant_id, codigo, nome)
select f.tenant_id, f.codigo, f.nome from public.fluxogramas f
where f.processo_id is null
on conflict (tenant_id, codigo) do nothing;
update public.fluxogramas f set processo_id = p.id from public.processos p
 where f.processo_id is null and p.tenant_id = f.tenant_id and p.codigo = f.codigo;
update public.pops o set processo_id = f.processo_id from public.fluxogramas f
 where o.processo_id is null and o.fluxograma_id = f.id;
update public.gravacoes g set processo_id = f.processo_id from public.fluxogramas f
 where g.processo_id is null and g.fluxograma_id = f.id;
update public.gravacoes g set processo_id = o.processo_id from public.pops o
 where g.processo_id is null and o.gravacao_id = g.id and o.processo_id is not null;
