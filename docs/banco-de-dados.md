# Fluxi — Modelo de dados

PostgreSQL 17 (Supabase no MVP). Construído por partes; esta é a **parte 1: núcleo multitenant e processos**.

## Convenções
- Chaves primárias `uuid` (`gen_random_uuid()`); datas em `timestamptz`.
- Toda tabela de dados de cliente tem `tenant_id` + RLS habilitado.
- Nomes em português, `snake_case`, tabelas no plural.
- `criado_em` e `atualizado_em` em todas as tabelas.
- Usuários vêm do Supabase Auth (`auth.users`); o Fluxi guarda o perfil em `perfis`.

## Parte 1 — tabelas

### `tenants` (empresas clientes)
| coluna | tipo | regra |
|---|---|---|
| id | uuid PK | |
| nome | text | obrigatório |
| slug | text | único, usado em URLs |
| logo_url | text | opcional (personalização do POP) |
| cor_destaque | text | hex, ex. `#F28C28` |
| criado_em / atualizado_em | timestamptz | |

### `perfis` (dados do usuário)
| coluna | tipo | regra |
|---|---|---|
| id | uuid PK | = `auth.users.id` |
| nome | text | |
| avatar_url | text | opcional |
| criado_em / atualizado_em | timestamptz | |

### `membros` (usuário ↔ tenant)
| coluna | tipo | regra |
|---|---|---|
| id | uuid PK | |
| tenant_id | uuid FK → tenants | |
| usuario_id | uuid FK → perfis | |
| papel | text | `dono`, `admin`, `aprovador`, `editor`, `leitor` |
| criado_em | timestamptz | |
| | | único (`tenant_id`, `usuario_id`) |

### `areas`
| coluna | tipo | regra |
|---|---|---|
| id | uuid PK | |
| tenant_id | uuid FK | |
| nome | text | ex. Comercial |
| sigla | text | 4 letras, ex. `COME`; única por tenant |
| cor_raia | text | hex fixo, definido no cadastro |
| proximo_seq_pop | int | contador para `COME-001` |

### `cargos`
Cargos são do tenant e podem existir em várias áreas.
| coluna | tipo | regra |
|---|---|---|
| id | uuid PK | |
| tenant_id | uuid FK | |
| nome | text | ex. Analista; único por tenant |

### `area_cargos` (cargo ↔ área, N:N)
| coluna | tipo | regra |
|---|---|---|
| tenant_id | uuid FK | |
| area_id | uuid FK → areas | |
| cargo_id | uuid FK → cargos | |
| | | PK (`area_id`, `cargo_id`) |

### `processos`
| coluna | tipo | regra |
|---|---|---|
| id | uuid PK | |
| tenant_id | uuid FK | |
| codigo | text | `XXXX-XXXX`, único por tenant, imutável |
| area_id | uuid FK → areas | |
| identificacao_pop | text | `COME-001`, único por tenant |
| nome | text | nome do procedimento |
| executor_cargo_id | uuid FK → cargos | deve existir em `area_cargos` para a área do processo |
| objetivo | text | |
| status | text | `rascunho`, `em_revisao`, `publicado`, `arquivado` (inicial; pode crescer) |
| criado_por | uuid FK → perfis | |
| criado_em / atualizado_em | timestamptz | |

### `processo_envolvidos`
| coluna | tipo | regra |
|---|---|---|
| processo_id | uuid FK | |
| tenant_id | uuid FK | |
| area_id | uuid FK | |
| cargo_id | uuid FK | o par (área, cargo) deve existir em `area_cargos` |
| | | PK (`processo_id`, `area_id`, `cargo_id`) |

## Relações
```
tenants 1─N membros N─1 perfis
tenants 1─N areas N─N cargos (via area_cargos)
tenants 1─N processos N─1 areas
processos 1─N processo_envolvidos (área · cargo)
```

## RLS (regra geral)
Um usuário só enxerga linhas de tenants dos quais é membro:
`tenant_id in (select tenant_id from membros where usuario_id = auth.uid())`.
Permissões por papel (cada papel inclui os de baixo):
| papel | pode |
|---|---|
| `dono` | tudo, inclusive excluir o tenant e gerenciar pagamento |
| `admin` | gerenciar membros, áreas e cargos |
| `aprovador` | aprovar e publicar (`em_revisao` → `publicado`) e arquivar |
| `editor` | criar e editar processos, enviar para revisão |
| `leitor` | só visualizar |

## Parte 2 — versões e fluxogramas (draw.io)

> **MVP:** entram `processo_versoes` (simplificada) e `fluxogramas`. As tabelas `fluxograma_revisoes`, `fluxograma_ajustes` e `fluxograma_nos` e o campo `checksum` ficam para depois (ver `docs/mvp.md`).

Foco no fluxograma. O POP da versão entra depois, ligado à mesma `processo_versoes`.

### `processo_versoes`
Cada processo tem versões; o que se edita, aprova e publica é a versão.
| coluna | tipo | regra |
|---|---|---|
| id | uuid PK | |
| tenant_id | uuid FK | |
| processo_id | uuid FK → processos | |
| numero | text | `1.0`, `1.1`, `2.0`; único por processo |
| status | text | `rascunho`, `em_revisao`, `publicado`, `arquivado` |
| motivo | text | o que mudou nesta versão |
| criado_por | uuid FK → perfis | |
| aprovado_por / aprovado_em | uuid / timestamptz | preenchidos na aprovação |
| criado_em / atualizado_em | timestamptz | |

Em `processos` entram `versao_publicada_id` (a "Atual", mostrada no Notion) e `versao_rascunho_id` (em edição). Só uma versão publicada por processo; publicar outra arquiva a anterior.

### `fluxogramas` (um por versão)
Estado atual do diagrama.
| coluna | tipo | regra |
|---|---|---|
| id | uuid PK | |
| tenant_id | uuid FK | |
| versao_id | uuid FK → processo_versoes | único |
| schema | jsonb | FluxoSchema (raias, nós, conexões, anotações) |
| xml | text | XML do draw.io (`mxGraphModel`), o que o editor abre |
| fonte_verdade | text | `schema` (gerado pela IA) ou `xml` (após edição manual) |
| revisao_atual | int | número da última revisão salva |
| checksum | text | último checksum enviado pelo editor (usado no diff sync, futuro) |
| png_path / svg_path | text | exportações no Storage (`tenants/{id}/fluxogramas/...`); o SVG é `xmlsvg` (continua editável) |
| atualizado_por | uuid FK → perfis | |
| criado_em / atualizado_em | timestamptz | |

### `fluxograma_revisoes` (histórico)
Cada salvamento gera uma revisão, para comparar e restaurar. O autosave do editor atualiza só `fluxogramas`; a revisão é criada ao salvar, ao aplicar um ajuste da IA ou a cada 5 min de edição.
| coluna | tipo | regra |
|---|---|---|
| id | uuid PK | |
| tenant_id | uuid FK | |
| fluxograma_id | uuid FK | |
| numero | int | sequencial por fluxograma |
| origem | text | `ia_geracao`, `ia_ajuste`, `manual`, `restauracao` |
| schema | jsonb | |
| xml | text | |
| resumo | text | ex. "Adicionada saída Não em Crédito aprovado?" |
| autor_id | uuid FK → perfis | nulo quando `ia_geracao` |
| criado_em | timestamptz | |

### `fluxograma_ajustes` (pedidos à IA)
"Se o crédito for negado, volta para o Comercial."
| coluna | tipo | regra |
|---|---|---|
| id | uuid PK | |
| tenant_id | uuid FK | |
| fluxograma_id | uuid FK | |
| instrucao | text | texto do usuário |
| no_ids | text[] | elementos selecionados quando pediu (opcional) |
| status | text | `processando`, `proposto`, `aplicado`, `descartado`, `erro` |
| schema_proposto | jsonb | resultado da IA, para "Ver diferença" |
| resposta | text | explicação da IA |
| revisao_id | uuid FK → fluxograma_revisoes | revisão criada ao aplicar |
| autor_id | uuid FK → perfis | |
| criado_em | timestamptz | |

### `fluxograma_nos` (rastreio e alertas)
Índice dos elementos do diagrama, regenerado a cada salvamento. Serve para o painel "de onde veio na transcrição", a confiança da IA e os alertas.
| coluna | tipo | regra |
|---|---|---|
| tenant_id | uuid FK | |
| fluxograma_id | uuid FK | |
| no_id | text | id da célula no XML (`mxCell id`) |
| tipo | text | tipo do FluxoSchema (`tarefa`, `gateway_exclusivo`…) |
| texto | text | |
| area_id | uuid FK → areas | raia |
| cargo_id | uuid FK → cargos | responsável (opcional) |
| confianca | text | `alta`, `media`, `baixa` (da IA) |
| trecho_inicio_ms / trecho_fim_ms | int | posição na gravação |
| transcricao_id | uuid | FK na parte 3 |
| | | PK (`fluxograma_id`, `no_id`) |

Alertas de consistência (gateway sem "Sim"/"Não", tarefa solta, raia vazia, sem início/fim) são calculados pela API a partir do `schema`/`xml`; não ficam gravados.

### Relações
```
processos 1─N processo_versoes 1─1 fluxogramas
fluxogramas 1─N fluxograma_revisoes
fluxogramas 1─N fluxograma_ajustes ─→ fluxograma_revisoes
fluxogramas 1─N fluxograma_nos N─1 areas
```

### Fluxo de vida do fluxograma
1. Worker gera `schema` com a IA → código gera `xml` → revisão 1 (`ia_geracao`), `fonte_verdade = schema`.
2. Usuário edita no draw.io → autosave em `fluxogramas.xml`; ao salvar, revisão `manual` e `fonte_verdade = xml`.
3. Pedido à IA → `fluxograma_ajustes` (`proposto`). Se `fonte_verdade = xml`, o app avisa que o layout será regerado. Aplicar → nova revisão `ia_ajuste`.
4. Aprovador publica a versão → revisão congelada; exporta PNG/SVG para o POP e o Notion.
5. Mudança num processo publicado → nova versão (`1.1`) copiando o fluxograma atual.

## Próximas partes (não incluídas)
- Parte 2b: POP da versão (conteúdo JSON + arquivos DOCX/PDF).
- Parte 3: gravações, transcrições e jobs.
- Parte 4: planos, assinaturas e uso (pagamentos).
- Parte 5: integrações (Notion) e auditoria.
