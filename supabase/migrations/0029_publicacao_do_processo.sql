-- Decisão 129: o processo passa a ter versão publicada, como o POP (decisão 32). Ao clicar em "Publicar", o INCFlow
-- guarda o nome, a descrição e o fluxograma (com a imagem SVG); a página pública do processo e a do fluxograma
-- mostram só essa cópia até a pessoa publicar de novo. Sem publicação, a página pública não abre.
alter table public.processos add column if not exists publicacao jsonb;
alter table public.processos add column if not exists publicacao_svg text;
alter table public.processos add column if not exists publicado_em timestamptz;
