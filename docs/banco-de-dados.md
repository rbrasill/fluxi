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

## Próximas partes (não incluídas)
- Parte 2: versões do processo, POPs (conteúdo JSON + arquivos) e fluxogramas (XML + FluxoSchema).
- Parte 3: gravações, transcrições e jobs.
- Parte 4: planos, assinaturas e uso (pagamentos).
- Parte 5: integrações (Notion) e auditoria.
