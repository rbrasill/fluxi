-- Fluxi · Gravação de tela com marcação de telas para o POP (docs/gravacao-tela.md).
-- O vídeo é gravado em segmentos (cada um < 50 MB, limite por arquivo do Supabase
-- no MVP); cada segmento é um arquivo WebM/MP4 independente e tocável.

create table if not exists public.gravacoes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  fluxograma_id uuid references public.fluxogramas(id) on delete set null,
  nome text not null,
  status text not null default 'gravando' check (status in ('gravando', 'pronta', 'interrompida', 'erro')),
  duracao_ms integer check (duracao_ms >= 0),
  largura integer,
  altura integer,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists gravacoes_tenant_criado on public.gravacoes (tenant_id, criado_em desc);

create table if not exists public.gravacao_segmentos (
  gravacao_id uuid not null references public.gravacoes(id) on delete cascade,
  indice integer not null check (indice >= 0),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  caminho text not null,
  inicio_ms integer not null check (inicio_ms >= 0),
  duracao_ms integer not null check (duracao_ms >= 0),
  bytes bigint not null,
  mime text not null,
  criado_em timestamptz not null default now(),
  primary key (gravacao_id, indice)
);

create table if not exists public.gravacao_marcacoes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  gravacao_id uuid not null references public.gravacoes(id) on delete cascade,
  tempo_ms integer not null check (tempo_ms >= 0),
  imagem_caminho text not null,
  largura integer,
  altura integer,
  instrucao text,
  instrucao_ia text,
  incluir_no_pop boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists gravacao_marcacoes_gravacao on public.gravacao_marcacoes (gravacao_id, tempo_ms);

alter table public.gravacoes enable row level security;
alter table public.gravacao_segmentos enable row level security;
alter table public.gravacao_marcacoes enable row level security;

-- Limite explícito por arquivo no bucket (igual ao limite global do plano Free).
update storage.buckets set file_size_limit = 52428800 where id = 'gravacoes';
