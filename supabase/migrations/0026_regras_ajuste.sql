-- Pedido de ajuste numa regra sugerida (decisão 108).
-- Quem confirma as regras do processo pode, em vez de confirmar ou descartar, dizer o que precisa mudar. A regra
-- continua em revisão, com o pedido guardado (o que ajustar, quem pediu e quando), e vai para os administradores
-- resolverem. Quando alguém edita a regra, o pedido é resolvido e ela volta para quem confirma.

alter table public.regras add column if not exists ajuste text not null default '';
alter table public.regras add column if not exists ajuste_por uuid references public.pessoas(id) on delete set null;
alter table public.regras add column if not exists ajuste_em timestamptz;

notify pgrst, 'reload schema';
