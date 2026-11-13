-- Definição: o terceiro tipo de regra (decisão 91).
-- Além da regra de negócio (RN) e da regra de comportamento (RC), a regra pode ser uma definição (DF): o que um
-- termo quer dizer no processo ("projeto estratégico", "cupom válido"). As regras dependem dessas palavras.

alter table public.regras drop constraint if exists regras_tipo_check;
alter table public.regras add constraint regras_tipo_check check (tipo in ('negocio', 'comportamento', 'definicao'));

notify pgrst, 'reload schema';
