-- Decisão 35: referências entre POPs e processos, e página pública do processo.

-- Página pública do processo (/pr/<link>), com a mesma chave online/offline do POP.
alter table public.processos add column if not exists link_publico text not null default replace(gen_random_uuid()::text, '-', '');
create unique index if not exists processos_link_publico on public.processos (link_publico);
alter table public.processos add column if not exists link_publico_ativo boolean not null default true;

-- Índice das referências que estão no texto dos documentos (o texto é a fonte; isto é derivado ao
-- salvar). Serve para "Referenciado em" e para avisar ao arquivar ou excluir.
create table if not exists public.referencias (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  origem_tipo text not null check (origem_tipo in ('pop', 'processo')),
  origem_id uuid not null,
  destino_tipo text not null check (destino_tipo in ('pop', 'processo')),
  destino_id uuid not null,
  relacao text not null check (relacao in ('proxima', 'anterior', 'depende', 'consulta')),
  campo text not null,
  criado_em timestamptz not null default now()
);
create index if not exists referencias_origem on public.referencias (origem_tipo, origem_id);
create index if not exists referencias_destino on public.referencias (destino_tipo, destino_id);
alter table public.referencias enable row level security;

notify pgrst, 'reload schema';
