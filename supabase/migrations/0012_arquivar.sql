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

-- O "código do processo" dos POPs e fluxogramas que já existem fica como está: o código está nos
-- documentos já emitidos. Os novos nascem com o código do processo (lib/server/pops.ts e fluxogramas.ts).
