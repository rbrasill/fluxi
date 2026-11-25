-- Decisão 129 (pedido do Rafael em 25/11/2026): tirar do ar todos os processos e todos os POPs. Daqui em diante, só
-- a pessoa coloca no ar. Não apaga nada: a versão publicada de cada POP continua guardada, e o link continua o mesmo;
-- quem abrir o link vê "não disponível" até a chave ser ligada de novo.
update public.processos set link_publico_ativo = false where link_publico_ativo;
update public.pops set link_publico_ativo = false where link_publico_ativo;
