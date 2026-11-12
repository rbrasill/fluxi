-- Arquivar entrevistas (decisão 72).
-- A entrevista arquivada sai do fluxo do processo (lista de ativas, fluxograma, perguntas para outras pessoas) e
-- fica guardada inteira na área de arquivadas, de onde pode ser restaurada. Só uma entrevista arquivada pode ser
-- excluída definitivamente. Guarda quando foi arquivada e por quem.
alter table public.entrevistas
  add column if not exists arquivado_em timestamptz,
  add column if not exists arquivado_por uuid references public.pessoas(id) on delete set null;
