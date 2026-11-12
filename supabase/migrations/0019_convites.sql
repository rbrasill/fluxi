-- Entrevistas por convite, dentro do processo (decisões 49 e 53).
-- A entrevista nasce com status 'convidada' (convite enviado, ninguém ligou ainda) e guarda quem convidou,
-- quando, a nota de quem convidou (o que a Maia deve focar), quando o e-mail saiu e quando a pessoa começou.
-- Só a pessoa convidada (entrevistado_id) abre a sessão de voz; o servidor confere antes de chamar a OpenAI.

alter table public.entrevistas drop constraint if exists entrevistas_status_check;
alter table public.entrevistas add constraint entrevistas_status_check
  check (status in ('convidada', 'em_andamento', 'processando', 'concluida', 'erro'));

alter table public.entrevistas
  add column if not exists convidado_por uuid references public.pessoas(id) on delete set null,
  add column if not exists convidado_em timestamptz,
  add column if not exists nota_convite text not null default '',
  add column if not exists convite_enviado_em timestamptz,
  add column if not exists iniciada_em timestamptz;

create index if not exists entrevistas_entrevistado on public.entrevistas (entrevistado_id, status);
