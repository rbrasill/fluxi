# Fluxi — Modelo de dados

PostgreSQL 17 (Supabase no MVP). O que está aqui é o que existe no banco; as migrações ficam em `supabase/migrations/` e são aplicadas pela Management API (`scripts/supabase-api.sh`).

## Hierarquia

```
conta (tenants)            quem usa o Fluxi: membros, convites (créditos de IA suspensos, decisão 20)
└─ organizacoes            empresas cujos processos são modelados
   └─ areas                Comercial, Financeiro… (nome único na organização)
      └─ processos         a unidade central (código XXXX-XXXX), com duas frentes:
         ├─ fluxogramas    o fluxograma do processo (um por processo): XML draw.io + FluxoSchema
         └─ pops           os POPs do processo: conteúdo (Modelo v3) + histórico
            └─ gravacoes   vídeo em segmentos + telas marcadas (do POP; `processo_id` vem dele)
```

Regras (decisão 31): toda área tem organização e todo processo tem área (obrigatórios); o fluxograma e o POP têm processo; a gravação tem POP. Organização só é excluída sem áreas; área só é excluída sem processos (contando os arquivados). Processo e POP são **arquivados** (`arquivado_em`), não excluídos: somem das listas com tudo o que têm; só o que está arquivado pode ser excluído definitivamente, e aí vai tudo junto (POPs, gravações e seus arquivos, fluxograma). Nunca sobra item sem processo. Enquanto não há login, tudo usa a conta padrão `00000000-0000-4000-8000-000000000001` (INC).

## Convenções
- Toda tabela de dados de cliente tem `tenant_id` e RLS ligado, sem políticas: só o servidor (chave `service_role`) lê e escreve.
- Chaves `uuid`, datas `timestamptz` (`criado_em`, `atualizado_em`).
- Arquivos (vídeo, telas, áudio) ficam no bucket privado `gravacoes`, em `tenants/<tenant>/gravacoes/<gravacao>/` (prints anexados no POP: `tenants/<tenant>/pops/<pop>/`; cópias dos prints da versão publicada: `tenants/<tenant>/publicacoes/<pop>/`; áudio da entrevista com a IA: `tenants/<tenant>/entrevistas/<entrevista>/conversa-<n>.webm`, um por sessão de voz); o banco guarda só o caminho.

## Tabelas

| Tabela | O que guarda | Migração |
|---|---|---|
| `tenants` | conta: nome, slug, `creditos_ia` (sem uso no momento) | 0001 |
| `uso_ia` | cada débito de crédito (tipo `fluxograma`, `transcricao`, `pop`); sem uso no momento | 0001, 0004 |
| `fluxogramas` | código (o do processo), nome, `xml`, `schema` (FluxoSchema), origem `manual`/`ia`/`modelo`, miniatura, `processo_id` (único: um fluxograma por processo), `link_publico` (página `/f/<link>`), `svg` (exportado pelo editor, o que a página pública mostra) e `tem_svg` (gerada) | 0001, 0005, 0012, 0013 |
| `gravacoes` | nome, status (`gravando`, `pausada`, `pronta`, `interrompida`, `erro`), duração, `pop_id` (o POP dono) e `processo_id` (o do POP), `processamento` da antiga transcrição sob demanda e `fluxograma_id` ficaram sem uso (decisão 33) | 0002, 0004, 0005, 0011, 0012 |
| `gravacao_segmentos` | um arquivo WebM por 3 min: caminho, `inicio_ms`; `transcricao_id`, `transcricao_status` e `falas` (jsonb) ficaram sem uso (decisão 33) | 0002, 0004 |
| `gravacao_marcacoes` | telas: dona é a gravação (`gravacao_id` + `tempo_ms`) ou o POP (`pop_id`, print anexado no editor, ou tela de uma gravação excluída que estava num passo, decisão 34); imagem, `instrucao` (digitada), `instrucao_ia`, `incluir_no_pop`; marcações desenhadas em `anotacoes` e a imagem final em `imagem_anotada_caminho` (+ largura/altura) | 0002, 0009, 0011 |
| `referencias` | índice das referências que estão no texto dos documentos (decisão 35): `origem_tipo`/`origem_id` (`pop` ou `processo`), `destino_tipo`/`destino_id`, `relacao` (`proxima`, `anterior`, `depende`, `consulta`) e `campo`. Derivado ao salvar; o texto é a fonte | 0015 |
| `pops` | nome, código (o do processo), identificação, versão, status (`rascunho`/`publicado`), `arquivado_em`, `link_publico` (página `/p/<link>`) e `link_publico_ativo` (chave online/offline, decisão 34), `publicacao` (jsonb: a versão publicada, com os prints copiados para `publicacoes/`) e `publicado_em`, `autor` (elaborado por), `conteudo` (jsonb, ver `lib/pop/schema.ts`), `historico`, `posicao` (onde a pessoa parou no editor), `processo_id`; `fluxograma_id` e `gravacao_id` ficaram sem uso (a gravação aponta para o POP) | 0003, 0005, 0010, 0011, 0012, 0013, 0014 |
| `processos` | código, nome, `descricao` (texto rico com referências, decisão 35), `area_id`, `arquivado_em`, `link_publico` (página `/pr/<link>`) e `link_publico_ativo` (chave online/offline) | 0005, 0006, 0012, 0015 |
| `entrevistas` | entrevista por voz com a Maia (decisões 39, 41 e 53): nasce por convite dentro de um processo (`processo_id`; `tema` é o nome do processo e `contexto` é montado da organização, da área, da descrição e da nota do convite), `motor` (`gpt-live`), status (`convidada`, `em_andamento`, `processando`, `concluida`, `erro`), `entrevistado_id` (a pessoa convidada, única que abre a sessão de voz), `convidado_por`, `convidado_em`, `nota_convite`, `convite_enviado_em`, `iniciada_em`, `em_ligacao_ate` (até quando a pessoa conta como "na ligação com a Maia": o navegador dela renova a cada 15 s e apaga ao pausar ou encerrar; decisão 69), `complemento` (jsonb: voltar para fechar pontos em aberto, decisão 56), `turnos` (jsonb: quem falou, `ia` ou `pessoa`, o texto, `inicio_ms`/`fim_ms` na linha do tempo da conversa e `sobreposta` quando a pessoa falou por cima da IA), `sessoes` (ids das sessões de voz no GPT-Live), `metricas` (jsonb: reação, falas sobrepostas, duração, eventos), `resultado` (jsonb: descrição em HTML, ficha e pendências), `erro`, `audio_caminho` (última gravação), `encerrado_em`; `cobertos` e `anotacoes` ficaram sem uso | 0016, 0017, 0018, 0019, 0020, 0021 |
| `areas` | nome, descrição, `organizacao_id` | 0006, 0007 |
| `organizacoes` | nome (único na conta) | 0007 |
| `pessoas` | quem pode entrar (decisão 50): nome, `email` (único, minúsculo), `nivel` (`comum`/`gestor`/`admin`), `versao_sessao` (incrementa ao sair, remover ou mudar o nível: derruba as sessões abertas) | 0018 |
| `login_codigos` | código pendente por e-mail: só o hash, validade, tentativas | 0018 |
| `login_limites` | contagem de pedidos de login por chave (IP ou e-mail) e janela de tempo | 0018 |
| `membros` | pessoa ↔ conta: papel `dono`/`admin`/`membro`, `todas_organizacoes`. Sem uso: era para o Supabase Auth, trocado pelo login da decisão 50 | 0008 |
| `membro_organizacoes` | organizações que um membro comum vê/edita | 0008 |
| `convites` | e-mail, papel, organizações liberadas, token, validade | 0008 |

Funções do login (decisão 50, migração 0018; só o `service_role` executa): `login_gravar_codigo` (grava o código respeitando a carência), `login_consumir_tentativa` (consome a tentativa antes de comparar, num comando só), `login_usar_codigo` (uso único) e `login_contar` (limite por janela).

Função: `debitar_creditos(tenant, qtd, tipo, detalhes)` debita de forma atômica e registra em `uso_ia`; devolve `null` se não há saldo. O app não usa créditos no momento (decisão 20); a função e as tabelas ficam para quando a cobrança voltar.

## Próximos passos (com o login)
- O login da decisão 50 usa `pessoas`; a API ainda usa a conta fixa (todas as pessoas são da conta INC). Com mais de uma conta, a conta vem da pessoa logada.
- RLS por membro: `tenant_id in (select tenant_id from membros where usuario_id = auth.uid())`, e para membro comum ainda filtrar `organizacao_id` por `membro_organizacoes`.
- Cargos e envolvidos (área · cargo) do POP viram tabelas quando entrar "Pessoas e acessos".
