-- Fluxi · Gravação → transcrição (AssemblyAI) → POP + fluxograma (Claude).
alter table public.gravacao_segmentos
  add column if not exists transcricao_id text,
  add column if not exists transcricao_status text not null default 'pendente'
    check (transcricao_status in ('pendente', 'processando', 'pronta', 'erro')),
  add column if not exists falas jsonb; -- [{falante, inicio_ms, fim_ms, texto}] com tempo global da gravação

alter table public.gravacoes
  add column if not exists processamento text not null default 'nenhum'
    check (processamento in ('nenhum', 'transcrevendo', 'analisando', 'pronto', 'erro')),
  add column if not exists processamento_erro text,
  add column if not exists pop_id uuid references public.pops(id) on delete set null;

alter table public.uso_ia drop constraint if exists uso_ia_tipo_check;
alter table public.uso_ia add constraint uso_ia_tipo_check check (tipo in ('fluxograma', 'transcricao', 'pop'));
