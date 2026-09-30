# Fluxi — Modelo de dados

PostgreSQL 17 (Supabase no MVP). O que está aqui é o que existe no banco; as migrações ficam em `supabase/migrations/` e são aplicadas pela Management API (`scripts/supabase-api.sh`).

## Hierarquia

```
conta (tenants)            quem usa o Fluxi: créditos de IA, membros, convites
└─ organizacoes            empresas cujos processos são modelados
   └─ areas                Comercial, Financeiro… (nome único na organização)
      └─ processos         a "pasta" do processo (código XXXX-XXXX)
         ├─ gravacoes      vídeo em segmentos + telas marcadas + transcrição
         ├─ fluxogramas    XML draw.io + FluxoSchema
         └─ pops           conteúdo do POP (Modelo v3) + histórico
```

Regras: toda área tem organização e todo processo tem área (obrigatórios). Organização só é excluída sem áreas; área só é excluída sem processos; excluir um processo apaga só a pasta (os itens ficam com `processo_id` nulo e continuam nas listas "Todos os itens"). Enquanto não há login, tudo usa a conta padrão `00000000-0000-4000-8000-000000000001` (INC).

## Convenções
- Toda tabela de dados de cliente tem `tenant_id` e RLS ligado, sem políticas: só o servidor (chave `service_role`) lê e escreve.
- Chaves `uuid`, datas `timestamptz` (`criado_em`, `atualizado_em`).
- Arquivos (vídeo, telas, áudio) ficam no bucket privado `gravacoes`, em `tenants/<tenant>/gravacoes/<gravacao>/`; o banco guarda só o caminho.

## Tabelas

| Tabela | O que guarda | Migração |
|---|---|---|
| `tenants` | conta: nome, slug, `creditos_ia` | 0001 |
| `uso_ia` | cada débito de crédito (tipo `fluxograma`, `transcricao`, `pop`) | 0001, 0004 |
| `fluxogramas` | código, nome, `xml`, `schema` (FluxoSchema), origem `manual`/`ia`/`modelo`, miniatura, `processo_id` | 0001, 0005 |
| `gravacoes` | nome, status, duração, `processamento` (`nenhum`→`transcrevendo`→`analisando`→`pronto`/`erro`), `pop_id`, `fluxograma_id`, `processo_id` | 0002, 0004, 0005 |
| `gravacao_segmentos` | um arquivo WebM por 3 min: caminho, `inicio_ms`, `transcricao_id`, `transcricao_status`, `falas` (jsonb) | 0002, 0004 |
| `gravacao_marcacoes` | telas marcadas: `tempo_ms`, imagem, `instrucao` (digitada), `instrucao_ia`, `incluir_no_pop` | 0002 |
| `pops` | nome, código (o mesmo do fluxograma), identificação, versão, status, `conteudo` (jsonb, ver `lib/pop/schema.ts`), `historico`, `fluxograma_id`, `gravacao_id`, `processo_id` | 0003, 0005 |
| `processos` | código, nome, descrição, `area_id` | 0005, 0006 |
| `areas` | nome, descrição, `organizacao_id` | 0006, 0007 |
| `organizacoes` | nome (único na conta) | 0007 |
| `membros` | pessoa ↔ conta: papel `dono`/`admin`/`membro`, `todas_organizacoes` | 0008 |
| `membro_organizacoes` | organizações que um membro comum vê/edita | 0008 |
| `convites` | e-mail, papel, organizações liberadas, token, validade | 0008 |

Função: `debitar_creditos(tenant, qtd, tipo, detalhes)` debita de forma atômica e registra em `uso_ia`; devolve `null` se não há saldo.

## Próximos passos (com o login)
- `membros` passa a ser preenchido pelo Supabase Auth; a API troca a conta fixa pela conta escolhida pela pessoa logada.
- RLS por membro: `tenant_id in (select tenant_id from membros where usuario_id = auth.uid())`, e para membro comum ainda filtrar `organizacao_id` por `membro_organizacoes`.
- Cargos e envolvidos (área · cargo) do POP viram tabelas quando entrar "Pessoas e acessos".
