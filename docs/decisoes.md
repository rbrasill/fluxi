# Fluxi — Registro de Decisões

Registro das decisões de arquitetura e produto tomadas durante o planejamento.

| # | Data | Tema | Decisão | Status |
|---|---|---|---|---|
| 1 | 2026-09-28 | Back-end | Node.js com TypeScript | Aceita |
| 2 | 2026-09-28 | Framework da API | Express | Aceita |
| 3 | 2026-09-28 | Arquitetura | Plataforma multitenant desde o início | Aceita |
| 4 | 2026-09-28 | Transcrição | AssemblyAI | Aceita |
| 5 | 2026-09-28 | Fluxogramas | draw.io em modo embed via `embed.diagrams.net` | Aceita |
| 6 | 2026-09-28 | POP | Modelo POP v3 como padrão da plataforma (ver `docs/modelo-pop.md`) | Aceita |
| 7 | 2026-09-28 | LLM de extração | Claude Sonnet 5 (`claude-sonnet-5`) via API da Anthropic | Aceita |
| 8 | 2026-09-28 | Fluxograma | XML do draw.io gerado direto, com a biblioteca de estilos BPMN (ver `docs/fluxograma.md`) | Aceita |
| 9 | 2026-09-28 | Banco de dados | ~~MySQL~~ → PostgreSQL 17 na Absam (absam.io) | Aceita |
| 10 | 2026-09-28 | Fluxograma | Todo fluxograma gerado é editável antes de publicar: editor draw.io, ajuste por instrução e versões (ver `docs/fluxograma.md`) | Aceita |

---

## 1. Back-end em Node.js
Uma linguagem só (TypeScript) no front e no back, com tipos compartilhados entre eles.

## 2. Express como framework da API
Escolhido por ser familiar. Complementos: `multer` (uploads), Zod (validação), `helmet`, `cors`, `express-rate-limit`, `pino-http`.

## 3. Multitenant desde o início
- Banco compartilhado com coluna `tenant_id` em todas as tabelas de dados. Isolamento na aplicação e reforçado por Row Level Security no Postgres (ver decisão 9).
- Usuário pode pertencer a vários tenants (tabela `Membership`).
- Arquivos, jobs de fila, integrações e limites de uso sempre separados por tenant.

## 4. Transcrição com AssemblyAI
- Recursos: `speaker_labels`, `language_code: 'pt'`, timestamps, `word_boost` por tenant, redação de PII.
- Fluxo assíncrono via webhook, validado por segredo.
- Uso contabilizado por tenant; a transcrição é apagada no AssemblyAI depois de salva no Fluxi.

## 5. draw.io via `embed.diagrams.net`
- Editor em iframe (`embed=1&proto=json`), com comunicação por `postMessage`.
- Fluxo: `init` → `load(xml)` → `autosave`/`save` → `export(png/svg)` para o POP.
- O XML fica no banco do Fluxi (PostgreSQL) (com `tenant_id` e versão); o draw.io não armazena nada.
- Licença Apache 2.0.
- **Futuro:** migrar para draw.io auto-hospedado (`jgraph/docker-drawio`) quando clientes exigirem que os diagramas não saiam da infraestrutura do Fluxi.

## 7. Claude Sonnet 5 via API da Anthropic
- Modelo `claude-sonnet-5` pelo SDK oficial `@anthropic-ai/sdk` (US$ 2 / US$ 10 por MTok de entrada/saída).
- Descartado o LLM Gateway do AssemblyAI: não oferece o Sonnet 5, e o Sonnet 4.6 de lá custa US$ 3 / US$ 15.
- Saída estruturada (`output_config.format`) com o `PopSchema`, validada com Zod.
- Batch API (-50%) para extrações sem urgência; cache de prompt para instruções e schema fixos.
- Extração isolada em `packages/ai` (`extrairPop(transcricao)`) para permitir troca de modelo/fornecedor.
- Estimativa: ~US$ 0,08 de LLM + ~US$ 0,23 de transcrição por hora de reunião.
- LGPD: Anthropic passa a ser processadora de dados (incluir nos termos).

## 9. Banco de dados PostgreSQL 17 (Absam)
- **Troca:** o MySQL da HostGator (5.7.44, fora de suporte desde 2023, sem RLS/CTEs/`CHECK`) foi descartado. O banco do Fluxi será **PostgreSQL 17 hospedado na Absam** (absam.io), com dados no Brasil (bom para a LGPD).
- Credenciais **somente** por variáveis de ambiente (`DATABASE_URL` ou `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`), nunca com valor padrão no código nem versionadas. `.env` fica no `.gitignore`. Conexão sempre com SSL.
- Usuários separados: um dono do schema (migrações) e um da aplicação, **sem** `BYPASSRLS` e sem ser dono das tabelas, com permissões mínimas.
- **Multitenant com duas travas:**
  - toda tabela de dados tem `tenant_id` + índice composto começando por `tenant_id`;
  - camada de repositório que exige o `tenantId` em toda consulta;
  - **Row Level Security** em todas as tabelas de tenant: a aplicação abre a transação com `SET LOCAL app.tenant_id = '...'` e as políticas filtram por `tenant_id = current_setting('app.tenant_id')::uuid`;
  - testes automáticos que tentam ler/alterar dados de outro tenant e precisam falhar.
- Recursos usados: `uuid` (`gen_random_uuid()`), `JSONB` para FluxoSchema/PopSchema, `CHECK` para regras simples, `timestamptz`, busca textual com dicionário `portuguese`. Futuro: `pgvector` para busca semântica, se a Absam permitir a extensão.
- ORM: a definir (Prisma ou Drizzle; Drizzle facilita o `SET LOCAL` por transação para o RLS).
- Pontos a verificar na Absam: se é banco gerenciado ou VPS, backups automáticos (e retenção), limite de conexões (usar pool/PgBouncer se for baixo), acesso remoto com SSL, extensões disponíveis.
- Arquivos (áudio, vídeo, imagens) não ficam no banco: vão para um storage de objetos, com o caminho salvo no Postgres.

---

## Em aberto
- Autenticação (Clerk, Supabase Auth ou própria)
- Integração com o Notion
