-- Meu perfil (decisão 84).
-- Cada pessoa completa o próprio cadastro: cargo, área, gestor direto e o que faz, com as palavras dela.
-- A Maia usa a área, o cargo e as atividades para não perguntar de novo quem a pessoa é e para perguntar melhor.
-- Tudo opcional: quem não preencher continua usando o INCFlow como antes.
alter table public.pessoas
  add column if not exists cargo text not null default '',
  add column if not exists area_id uuid references public.areas(id) on delete set null,
  add column if not exists gestor text not null default '',
  add column if not exists atividades text not null default '';
