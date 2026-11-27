-- Decisão 133: ícone do processo, escolhido pela pessoa entre os ícones do Lucide. Guarda o nome do ícone, a cor
-- (0 a 7, ou nula para a cor de sempre) e o desenho (os nós do SVG, conferidos pelo servidor). Sem ícone, a pasta
-- continua com o quadradinho colorido.
alter table public.processos add column if not exists icone jsonb;
