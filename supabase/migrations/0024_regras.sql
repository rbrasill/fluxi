-- Regras de negócio do processo, capturadas pela Maia (decisão 89).
--
-- 1. A entrevista ganha uma finalidade: 'processo' (mapear o processo, a de sempre) ou 'regras' (levantar as
--    regras de negócio e de comportamento). Cada finalidade tem a sua condução, a sua análise e o seu convite.
-- 2. O processo guarda quem confirma as regras dele: a pessoa escolhida por um gestor ou administrador (pode
--    ser a própria pessoa entrevistada). Administradores também confirmam.
-- 3. A tabela `regras`: cada regra nasce 'sugerida' pela Maia (com o trecho da fala de onde saiu) ou é escrita
--    à mão (já confirmada). Só a regra confirmada ganha número (RN-01, RC-01: por processo e por tipo) e passa a
--    valer. Descartada e arquivada ficam guardadas, fora das listas.

alter table public.entrevistas
  add column if not exists finalidade text not null default 'processo';
alter table public.entrevistas drop constraint if exists entrevistas_finalidade_check;
alter table public.entrevistas add constraint entrevistas_finalidade_check check (finalidade in ('processo', 'regras'));

alter table public.processos
  add column if not exists confirmador_regras_id uuid references public.pessoas(id) on delete set null;

create table if not exists public.regras (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  processo_id uuid not null references public.processos(id) on delete cascade,
  tipo text not null check (tipo in ('negocio', 'comportamento')),
  texto text not null,
  situacao text not null default 'sugerida' check (situacao in ('sugerida', 'confirmada', 'descartada', 'arquivada')),
  numero integer, -- só depois de confirmada: a sequência por processo e por tipo (RN-01, RC-01)
  pop_id uuid references public.pops(id) on delete set null, -- a que se aplica; vazio: o processo inteiro
  origem text not null default 'maia' check (origem in ('maia', 'manual')),
  entrevista_id uuid references public.entrevistas(id) on delete set null, -- a conversa de onde saiu
  trecho text not null default '', -- a fala da pessoa, como foi dita
  trecho_ms integer, -- onde a fala começa na linha do tempo da conversa
  conflito_regra_id uuid references public.regras(id) on delete set null, -- a regra confirmada com que pode conflitar
  conflito text not null default '', -- por que pode conflitar
  perguntar_em timestamptz, -- marcada para a Maia perguntar na próxima entrevista de regras do processo
  esclarecimento text not null default '', -- o que a pessoa da entrevista seguinte respondeu sobre a dúvida
  esclarecimento_entrevista_id uuid references public.entrevistas(id) on delete set null,
  criado_por uuid references public.pessoas(id) on delete set null,
  confirmada_por uuid references public.pessoas(id) on delete set null,
  confirmada_em timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists regras_processo on public.regras (processo_id, situacao);
create index if not exists regras_entrevista on public.regras (entrevista_id);
create unique index if not exists regras_numero on public.regras (processo_id, tipo, numero) where numero is not null;
alter table public.regras enable row level security;

notify pgrst, 'reload schema';
