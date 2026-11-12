-- Decisão 39: entrevista por voz com a IA para mapear o processo (protótipo).
-- A conversa fica em `turnos` (o que a IA falou e o que a pessoa respondeu, pela escuta ao vivo);
-- `cobertos` e `anotacoes` são o que a IA vai marcando para escolher a próxima pergunta; `resultado`
-- é o que sai depois que a chamada termina (descrição, ficha do processo e pendências).
create table if not exists public.entrevistas (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  processo_id uuid not null references public.processos(id) on delete cascade,
  status text not null default 'em_andamento' check (status in ('em_andamento', 'processando', 'concluida', 'erro')),
  turnos jsonb not null default '[]'::jsonb,
  cobertos jsonb not null default '[]'::jsonb,
  anotacoes jsonb not null default '[]'::jsonb,
  resultado jsonb,
  erro text,
  audio_caminho text,
  criado_em timestamptz not null default now(),
  encerrado_em timestamptz,
  atualizado_em timestamptz not null default now()
);
create index if not exists entrevistas_processo on public.entrevistas (processo_id, criado_em desc);
alter table public.entrevistas enable row level security;

notify pgrst, 'reload schema';
