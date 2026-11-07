-- Decisão 41: entrevista só com o GPT-Live (OpenAI) e fora do processo, para testar.
-- A entrevista não precisa mais de processo: tem um tema (o processo a mapear, em texto) e um contexto.
alter table public.entrevistas alter column processo_id drop not null;
alter table public.entrevistas add column if not exists tema text not null default '';
alter table public.entrevistas add column if not exists contexto text not null default '';
alter table public.entrevistas add column if not exists motor text not null default 'gpt-live';
alter table public.entrevistas add column if not exists sessoes jsonb not null default '[]'::jsonb; -- ids das sessões de voz (uma por vez que a conversa começa ou continua)
alter table public.entrevistas add column if not exists metricas jsonb not null default '{}'::jsonb;
create index if not exists entrevistas_tenant on public.entrevistas (tenant_id, criado_em desc);

notify pgrst, 'reload schema';
