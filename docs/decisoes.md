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
| 11 | 2026-09-28 | Infra do MVP | Supabase (Postgres + Storage) para MVP e testes; Postgres 17 na Absam fica para produção | Aceita |
| 12 | 2026-09-29 | Front-end e hospedagem | Next.js (React + TypeScript) no front; back em Node.js (Express); Vercel para front e API, worker à parte | Aceita |
| 13 | 2026-09-29 | MVP: API e IA | API do MVP em rotas do Next.js (sem login, tenant padrão); IA por créditos, com criação manual sempre disponível | Aceita |
| 14 | 2026-09-29 | Gravação de tela | Gravação no navegador com janela flutuante (Document PiP) e botão "Incluir esta tela no POP" (ver `docs/gravacao-tela.md`) | Aceita |
| 15 | 2026-09-29 | POP | Editor de POP e geração do DOCX no Modelo POP v3 (docxtemplater), com as telas da gravação como passos ilustrados | Aceita |

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

## 11. Supabase no MVP e nos testes
- Banco (Postgres, com RLS) e arquivos (Supabase Storage) do MVP ficam no Supabase. A produção segue prevista no Postgres 17 da Absam (decisão 9); o schema é Postgres puro, então a migração é direta.
- Evitar prender o código ao Supabase: migrações em SQL versionadas no repo, acesso ao banco pelo ORM via connection string e storage atrás de uma interface (`packages/core/storage`), para trocar por S3/Absam depois.
- Storage: buckets privados, caminho `tenants/{tenant_id}/...`, acesso só por URLs assinadas geradas pela API.
- A chave `service_role` fica só no back-end (API/worker), nunca no front-end.
- Configuração pelo conector Supabase (MCP) ou pela Management API (HTTPS); a porta 5432 não é acessível do ambiente de desenvolvimento em nuvem.

## 12. Next.js no front, Node.js + Express no back
- **Motivo:** o Fluxi será um produto com páginas públicas (landing, preços, cadastro de empresas, links públicos de POP/fluxograma), que precisam de SEO e carregamento rápido. O Next.js atende o site público e o app no mesmo projeto. Vite foi considerado e descartado por esse motivo.
- **Front-end:** Next.js (App Router) com React e TypeScript, usado **só como front**:
  - páginas públicas renderizadas no servidor (SEO);
  - área logada (`/app/...`) com componentes de cliente; o editor draw.io e o gravador de tela/áudio carregam só no navegador (`"use client"` + import dinâmico);
  - login com Supabase Auth via `@supabase/ssr` (sessão em cookie httpOnly, rotas protegidas no middleware).
- **Sem API Routes/Server Actions para regra de negócio:** toda regra fica na API Express, para não haver duas APIs. O Next pode usar rotas próprias só para coisas de front (ex.: callback do login).
- **Back-end:** Node.js + Express (decisão 2); tipos e schemas compartilhados em `packages/core`.
- **Variáveis do front** usam o prefixo `NEXT_PUBLIC_` (só URL e chave `anon` do Supabase). As secretas ficam só no back.
- **Hospedagem no MVP:**
  - Vercel: Next.js e API Express (como funções);
  - uploads de áudio e vídeo vão direto do navegador para o Supabase Storage, com URL assinada gerada pela API (a Vercel limita requisições a ~4,5 MB);
  - worker (fila, ffmpeg, IA, geração de POP e fluxograma) roda fora da Vercel, num processo contínuo (Railway, Render ou Fly.io). Fila a definir: BullMQ + Redis ou `pgmq` no Supabase.

## 13. MVP: API nas rotas do Next.js, sem login, IA por créditos
- **API:** no MVP, as rotas ficam em `app/api/*` (Next.js, funções na Vercel), para um único deploy. A regra de negócio fica em `lib/server/*`, sem depender do Next, para ser movida para o Express (decisão 2) quando o worker e a API separada entrarem.
- **Sem login por enquanto:** tudo usa um tenant padrão (INC). O acesso ao Supabase é só pelo servidor, com a chave `service_role`; RLS ligado e sem políticas, então a chave pública não lê nada. Login e RLS por membro entram depois.
- **Fluxogramas no Supabase:** tabela `fluxogramas` (XML, FluxoSchema, origem `manual`/`ia`/`modelo`, miniatura). Migração em `supabase/migrations/0001_fluxogramas.sql`.
- **IA por créditos:** cada empresa tem `creditos_ia`. Gerar fluxograma custa 1 crédito; transcrever áudio, 1. Débito atômico no banco (`debitar_creditos`) e registro em `uso_ia`. Sem créditos, a IA fica bloqueada e o usuário continua **criando manualmente**.
- **Três jeitos de gerar com IA:** descrição do processo, transcrição colada/arquivo (.txt, .vtt, .srt) e áudio/vídeo (vai para o Storage, é transcrito pelo AssemblyAI e segue para a IA).
- **Geração:** Claude Sonnet 5 devolve o FluxoSchema (saída estruturada) e o código monta o XML com os estilos da biblioteca BPMN INC (`lib/fluxo/`), já editável no draw.io.

---

## Em aberto
- Autenticação (Clerk, Supabase Auth ou própria)
- Integração com o Notion
