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
| papel | text | `dono`, `admin`, `editor`, `leitor` |
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
| coluna | tipo | regra |
|---|---|---|
| id | uuid PK | |
| tenant_id | uuid FK | |
| area_id | uuid FK → areas | |
| nome | text | ex. Analista Comercial |

### `processos`
| coluna | tipo | regra |
|---|---|---|
| id | uuid PK | |
| tenant_id | uuid FK | |
| codigo | text | `XXXX-XXXX`, único por tenant, imutável |
| area_id | uuid FK → areas | |
| identificacao_pop | text | `COME-001`, único por tenant |
| nome | text | nome do procedimento |
| executor_cargo_id | uuid FK → cargos | |
| objetivo | text | |
| status | text | `rascunho`, `em_revisao`, `publicado`, `arquivado` |
| criado_por | uuid FK → perfis | |
| criado_em / atualizado_em | timestamptz | |

### `processo_envolvidos`
| coluna | tipo | regra |
|---|---|---|
| processo_id | uuid FK | |
| tenant_id | uuid FK | |
| area_id | uuid FK | |
| cargo_id | uuid FK | |
| | | PK (`processo_id`, `area_id`, `cargo_id`) |

## Relações
```
tenants 1─N membros N─1 perfis
tenants 1─N areas 1─N cargos
tenants 1─N processos N─1 areas
processos 1─N processo_envolvidos (área · cargo)
```

## RLS (regra geral)
Um usuário só enxerga linhas de tenants dos quais é membro:
`tenant_id in (select tenant_id from membros where usuario_id = auth.uid())`.
Escrita exige papel `editor` ou superior; gestão de membros e áreas, `admin` ou `dono`.

## Próximas partes (não incluídas)
- Parte 2: versões do processo, POPs (conteúdo JSON + arquivos) e fluxogramas (XML + FluxoSchema).
- Parte 3: gravações, transcrições e jobs.
- Parte 4: planos, assinaturas e uso (pagamentos).
- Parte 5: integrações (Notion) e auditoria.
