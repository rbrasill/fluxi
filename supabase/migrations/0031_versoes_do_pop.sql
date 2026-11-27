-- Decisão 138: versionamento do POP. A versão (X.Y.Z) deixa de ser digitada e passa a ser dada pelo INCFlow a cada
-- publicação: correção (Z), ajuste (Y) ou mudança no procedimento (X), com uma frase dizendo o que mudou. Cada versão
-- publicada fica guardada (`pop_versoes`), com a cópia do documento daquele dia, para consultar e baixar o PDF depois.
create table if not exists public.pop_versoes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  pop_id uuid not null references public.pops(id) on delete cascade,
  maior integer not null check (maior >= 1),
  menor integer not null default 0 check (menor >= 0),
  correcao integer not null default 0 check (correcao >= 0),
  tipo text not null check (tipo in ('primeira', 'correcao', 'ajuste', 'mudanca')),
  o_que_mudou text not null default '',
  publicado_por text not null default '',
  publicado_por_id uuid references public.pessoas(id) on delete set null,
  publicado_em timestamptz not null default now(),
  -- O documento como foi publicado (o mesmo formato de `pops.publicacao`), com os prints nos caminhos das cópias.
  publicacao jsonb not null,
  -- De qual print (caminho no editor) veio cada cópia: a versão seguinte reaproveita a cópia do print que não mudou.
  copias jsonb not null default '{}'::jsonb,
  unique (pop_id, maior, menor, correcao)
);
create index if not exists pop_versoes_do_pop on public.pop_versoes (pop_id, maior desc, menor desc, correcao desc);
-- Só o servidor lê e grava (chave de serviço), como nas outras tabelas.
alter table public.pop_versoes enable row level security;

-- Os POPs que já têm versão publicada guardada viram a versão 1.0.0. Não havia registro de quem publicou: fica o
-- "Elaborado por" do POP. Rodar de novo não duplica.
insert into public.pop_versoes (tenant_id, pop_id, maior, menor, correcao, tipo, o_que_mudou, publicado_por, publicado_em, publicacao)
select p.tenant_id, p.id, 1, 0, 0, 'primeira', 'Versão inicial (publicada antes do versionamento).', coalesce(p.autor, ''),
       coalesce(p.publicado_em, (p.publicacao->>'publicado_em')::timestamptz, now()), p.publicacao
from public.pops p
where p.publicacao is not null
  and not exists (select 1 from public.pop_versoes v where v.pop_id = p.id);

-- `pops.versao` passa a guardar a versão publicada atual: 1.0.0 para quem já tem versão guardada e vazio para quem
-- ainda não publicou (todos estavam com o "1.0" que vinha de fábrica). Quem já está no formato X.Y.Z não é tocado.
alter table public.pops alter column versao set default '';
update public.pops p set versao = case when exists (select 1 from public.pop_versoes v where v.pop_id = p.id) then '1.0.0' else '' end
where p.versao !~ '^[0-9]+\.[0-9]+\.[0-9]+$';
