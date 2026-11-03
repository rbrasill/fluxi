-- Decisão 34: chave "online/offline" do link público do POP. Desligada, a página pública mostra
-- "Este POP não está disponível", sem mexer na versão publicada (que continua guardada).
alter table public.pops add column if not exists link_publico_ativo boolean not null default true;

notify pgrst, 'reload schema';
