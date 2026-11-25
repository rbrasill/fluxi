-- Decisão 128: a publicação nunca é automática. O processo novo (e a cópia) nasce com a página pública fora do ar;
-- só a pessoa a coloca no ar, pela chave da página do processo. O código já grava false ao criar; aqui o padrão do
-- banco passa a ser o mesmo. Não muda os processos que já existem.
alter table public.processos alter column link_publico_ativo set default false;
