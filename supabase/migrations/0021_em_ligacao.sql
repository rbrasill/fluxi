-- Entrevista em ligação agora (decisão 69).
-- Enquanto a pessoa conversa com a Maia, o navegador dela renova este prazo a cada 15 s (junto com a conversa ou
-- num pulso leve); ao pausar ou encerrar, ele é apagado. Se o prazo ainda não passou, a entrevista está "em
-- andamento" de verdade: aparece assim nas listas e ninguém além da própria pessoa abre a conversa. Se o navegador
-- fechar sem avisar, o prazo vence sozinho em menos de um minuto e a entrevista volta a aparecer como pausada.
alter table public.entrevistas add column if not exists em_ligacao_ate timestamptz;
