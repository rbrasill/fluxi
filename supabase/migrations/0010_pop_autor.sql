-- Quem elaborou o POP ("Elaborado por" do Modelo POP v3). Preenchido pela pessoa enquanto não há
-- login; depois vem do usuário logado. As linhas do histórico sem nome usam este valor.
alter table public.pops add column if not exists autor text not null default '';
