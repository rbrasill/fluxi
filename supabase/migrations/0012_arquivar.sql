-- Decisão 31: arquivar em vez de excluir (processo e POP), um fluxograma por processo e a
-- gravação pertencendo ao POP.

-- Arquivado: some das listas com tudo o que tem dentro; só o que está arquivado pode ser excluído.
alter table public.processos add column if not exists arquivado_em timestamptz;
alter table public.pops add column if not exists arquivado_em timestamptz;
create index if not exists processos_arquivado on public.processos (tenant_id, arquivado_em);
create index if not exists pops_arquivado on public.pops (tenant_id, arquivado_em);

-- Um fluxograma por processo.
create unique index if not exists fluxogramas_um_por_processo on public.fluxogramas (processo_id) where processo_id is not null;

-- A gravação pertence ao POP: quem já gerou um POP passa a apontar para ele.
update public.gravacoes g set pop_id = o.id from public.pops o
 where o.gravacao_id = g.id and g.pop_id is null;
create index if not exists gravacoes_pop on public.gravacoes (pop_id);

-- O "código do processo" do POP é o código do processo em que ele está (antes vinha do fluxograma
-- ou era sorteado). O fluxograma do processo também leva o código dele.
update public.pops o set codigo = p.codigo from public.processos p where o.processo_id = p.id and o.codigo <> p.codigo;
update public.fluxogramas f set codigo = p.codigo from public.processos p
 where f.processo_id = p.id and f.codigo <> p.codigo
   and not exists (select 1 from public.fluxogramas x where x.tenant_id = f.tenant_id and x.codigo = p.codigo and x.id <> f.id);
