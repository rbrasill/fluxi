-- Fluxi · Pausar e retomar (gravação e POP) e prints anexados direto no POP (docs/decisoes.md, 23).

-- Gravação pausada pela pessoa ("Continuar depois"): tudo o que foi gravado já está salvo;
-- "gravando" sem aba aberta passa a significar gravação não finalizada (interrompida).
alter table public.gravacoes drop constraint if exists gravacoes_status_check;
alter table public.gravacoes
  add constraint gravacoes_status_check check (status in ('gravando', 'pausada', 'pronta', 'interrompida', 'erro'));

-- Onde a pessoa parou no editor do POP ({ chave, rotulo }), para retomar no mesmo ponto.
alter table public.pops add column if not exists posicao jsonb;

-- Uma tela (print) pertence a uma gravação (marcada durante a gravação, com o tempo)
-- ou a um POP (anexada depois, no editor). Os arquivos das telas do POP ficam em
-- tenants/<tenant>/pops/<pop>/.
alter table public.gravacao_marcacoes
  alter column gravacao_id drop not null,
  alter column tempo_ms drop not null,
  add column if not exists pop_id uuid references public.pops(id) on delete cascade;
alter table public.gravacao_marcacoes drop constraint if exists gravacao_marcacoes_dono_check;
alter table public.gravacao_marcacoes
  add constraint gravacao_marcacoes_dono_check check (
    num_nonnulls(gravacao_id, pop_id) = 1 and (gravacao_id is null or tempo_ms is not null)
  );
create index if not exists gravacao_marcacoes_pop on public.gravacao_marcacoes (pop_id) where pop_id is not null;
