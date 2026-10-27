-- Marcações desenhadas sobre a tela (caixa, seta, número, texto, recorte).
-- O print original não muda: as formas ficam em `anotacoes` (coordenadas em pixels da imagem original)
-- e a versão final, já desenhada e recortada, vira outro PNG, que é o usado no POP e no DOCX.
alter table public.gravacao_marcacoes
  add column if not exists anotacoes jsonb,
  add column if not exists imagem_anotada_caminho text,
  add column if not exists anotada_largura integer,
  add column if not exists anotada_altura integer;
