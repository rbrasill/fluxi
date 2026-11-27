-- Quem criou o POP e o processo (decisão 149): a prévia antes de publicar só abre para essa pessoa.
-- Até aqui o POP guardava só o nome ("Elaborado por", em `autor`) e o processo não guardava nada.
alter table public.pops add column if not exists criado_por_id uuid references public.pessoas(id) on delete set null;
alter table public.processos add column if not exists criado_por_id uuid references public.pessoas(id) on delete set null;

-- O que já existe: no POP, a pessoa cujo nome é o do "Elaborado por" (só quando o nome é de uma pessoa só).
update public.pops p set criado_por_id = x.id
from (
  select tenant_id, lower(btrim(nome)) as nome, (array_agg(id))[1] as id
  from public.pessoas group by tenant_id, lower(btrim(nome)) having count(*) = 1
) x
where p.criado_por_id is null and btrim(p.autor) <> '' and x.tenant_id = p.tenant_id and x.nome = lower(btrim(p.autor));

-- Sem isso, quem publicou a primeira versão. O que continuar sem ninguém fica para os administradores.
update public.pops p set criado_por_id = v.publicado_por_id
from (
  select distinct on (pop_id) pop_id, publicado_por_id from public.pop_versoes
  where publicado_por_id is not null order by pop_id, maior, menor, correcao
) v
where p.criado_por_id is null and v.pop_id = p.id;

update public.processos p set criado_por_id = v.publicado_por_id
from (
  select distinct on (processo_id) processo_id, publicado_por_id from public.processo_versoes
  where publicado_por_id is not null order by processo_id, maior, menor, correcao
) v
where p.criado_por_id is null and v.processo_id = p.id;
