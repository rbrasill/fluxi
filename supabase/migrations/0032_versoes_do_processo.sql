-- Decisão 139: versionamento do processo, como o do POP (decisão 138). A versão (X.Y.Z) é do processo, independente
-- das versões dos POPs, e muda só quando a pessoa publica o processo: correção (Z), ajuste (Y) ou mudança no
-- processo (X), com uma frase dizendo o que mudou. Cada versão publicada fica guardada, com a descrição e a imagem
-- do fluxograma daquele dia.
create table if not exists public.processo_versoes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  processo_id uuid not null references public.processos(id) on delete cascade,
  maior integer not null check (maior >= 1),
  menor integer not null default 0 check (menor >= 0),
  correcao integer not null default 0 check (correcao >= 0),
  tipo text not null check (tipo in ('primeira', 'correcao', 'ajuste', 'mudanca')),
  o_que_mudou text not null default '',
  publicado_por text not null default '',
  publicado_por_id uuid references public.pessoas(id) on delete set null,
  publicado_em timestamptz not null default now(),
  -- O processo como foi publicado (o mesmo formato de `processos.publicacao`) e a imagem do fluxograma daquele dia.
  publicacao jsonb not null,
  publicacao_svg text,
  unique (processo_id, maior, menor, correcao)
);
create index if not exists processo_versoes_do_processo on public.processo_versoes (processo_id, maior desc, menor desc, correcao desc);
-- Só o servidor lê e grava (chave de serviço), como nas outras tabelas.
alter table public.processo_versoes enable row level security;

-- Processo que já tenha versão publicada guardada vira a 1.0.0 (na data desta migração não havia nenhum). Não havia
-- registro de quem publicou. Rodar de novo não duplica.
insert into public.processo_versoes (tenant_id, processo_id, maior, menor, correcao, tipo, o_que_mudou, publicado_por, publicado_em, publicacao, publicacao_svg)
select p.tenant_id, p.id, 1, 0, 0, 'primeira', 'Versão inicial (publicada antes do versionamento).', '',
       coalesce(p.publicado_em, (p.publicacao->>'publicado_em')::timestamptz, now()), p.publicacao, p.publicacao_svg
from public.processos p
where p.publicacao is not null
  and not exists (select 1 from public.processo_versoes v where v.processo_id = p.id);
