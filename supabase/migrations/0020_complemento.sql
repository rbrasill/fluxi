-- Voltar à ligação para fechar pontos em aberto (decisão 56).
-- A pessoa entrevistada (ou um gestor, para ela) escolhe quais pendências do resultado quer responder; a entrevista
-- volta a "em andamento" com o complemento marcado: { pendencias, escolhidas_em, escolhidas_por, a_partir_do_turno,
-- concluido_em }. A Maia recebe a lista e vai direto aos pontos; ao encerrar, o resultado é refeito com a conversa inteira.
alter table public.entrevistas add column if not exists complemento jsonb;
