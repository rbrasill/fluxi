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
| 7 | 2026-09-30 | LLM de extração | Claude Sonnet 5.5 (`claude-sonnet-5-5`) via API da Anthropic (antes: Sonnet 5) | Aceita |
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

## 7. Claude Sonnet 5.5 via API da Anthropic
- Modelo `claude-sonnet-5-5` pelo SDK oficial `@anthropic-ai/sdk` (US$ 2 / US$ 10 por MTok de entrada/saída, mesmo preço do Sonnet 5, que era a escolha anterior).
- Comparação (set/2026): Haiku 4.5 US$ 1/5 (mais barato, erra mais em reuniões longas); Opus 5.5 US$ 4/20 (desnecessário). Custo estimado por fluxograma de uma reunião de 1 h: ~US$ 0,09.
- Fallback no servidor (`fallbacks: "default"`) para recusas indevidas do filtro de segurança.
- Chave com workspace: `ANTHROPIC_API_KEY` + `ANTHROPIC_WORKSPACE_ID`.
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

## 14. Gravação → POP + fluxograma (AssemblyAI barato)
- **Modelo de transcrição:** `universal-3-5-pro` com fallback `universal-2` (padrão do AssemblyAI para arquivo gravado). US$ 0,21/h, português com sotaque brasileiro. Diarização (`speaker_labels`) +US$ 0,02/h. Nenhum outro add-on pago (PII, entidades, keyterms, resumo).
- **Universal-3.6 Pro não serve aqui:** é só para streaming (tempo real), a US$ 0,45/h. Como a gravação já existe, o arquivo gravado sai por menos da metade do preço.
- **LGPD:** depois de salvar o texto no Fluxi, a transcrição é apagada no AssemblyAI (`DELETE /v2/transcript/{id}`). No plano pago, configurar TTL e opt-out de treino em Data Controls.
- **Fluxo:** um job de transcrição por segmento de 3 min (tempos somados ao início do segmento). O navegador consulta a cada 5 s e cada consulta avança o processamento (sem fila). Quando tudo está transcrito, uma trava atômica no banco garante que só uma requisição chama o Claude, que devolve **POP + fluxograma + instrução de cada tela numa chamada só**, para enviar a transcrição uma vez.
- **Custo:** 3 créditos (transcrição, fluxograma, POP). Numa nova tentativa, as partes já transcritas são reaproveitadas. Custo real aproximado por 1 h de gravação: ~US$ 0,23 de transcrição + ~US$ 0,10 a 0,20 de Claude.

## 15. Processo como pasta
- **Processo** (`processos`) é a unidade de navegação: cada um tem código, nome e área, e reúne as gravações (com a transcrição), os fluxogramas e os POPs dele. A tela inicial é a lista de processos.
- Os itens têm `processo_id`. Quem é criado dentro do processo já nasce nele; o POP herda o processo do fluxograma ou da gravação de origem, e a geração com IA a partir de uma gravação coloca POP e fluxograma no mesmo processo.
- Excluir o processo exclui só a pasta: os itens continuam nas listas de "Todos os itens", sem processo. Assim nada se perde por engano.
- Os itens que já existiam foram migrados: um processo por fluxograma, com o mesmo código e nome, junto dos POPs e gravações ligados a ele (`0005_processos.sql`).

## 16. Organização → Área → Processo → itens
- A navegação (e, com o login, o acesso) segue: **Organização → Área → Processos da área → gravações, fluxogramas e POPs do processo**. A tela inicial é a lista de organizações.
- **Conta (tenant) ≠ organização:** a conta é quem usa o Fluxi (créditos de IA e, depois, usuários); a organização é a empresa cujos processos são modelados. Uma conta modela várias organizações (`0007_organizacoes.sql`). Nome de área é único dentro da organização; organização só é excluída sem áreas. As áreas que existiam foram para "INC Empreendimentos".
- Todo processo pertence a uma área (`processos.area_id`, obrigatório). O processo pode ser movido de área; a área só pode ser excluída vazia. Nome de área é único por empresa.
- O POP criado num processo já vem com a área preenchida.
- **Acesso (quando entrar o login):** cada pessoa recebe as organizações e/ou áreas que pode ver ou editar (membros por organização e por área), e as consultas e o RLS filtram por elas. Hoje, sem login, todos veem tudo.
- Os processos que já existiam foram para a área "Geral" (`0006_areas.sql`). A coluna texto `processos.area` ficou só por compatibilidade.

## 17. Contas, pessoas e convites
- **Conta (tenant)** é de quem usa o Fluxi; a pessoa que cria a conta é a **dona**. Os créditos de IA são da conta.
- A conta **convida pessoas por e-mail**. Quem convida escolhe o papel (admin vê tudo; membro vê só o liberado) e **quais organizações** o convidado enxerga e pode editar (`membros`, `membro_organizacoes`, `convites`, em `0008_membros_convites.sql`).
- **Uma pessoa pode estar em várias contas:** a própria (com suas organizações) e as em que foi convidada. Ao entrar, escolhe a conta em que vai trabalhar, e tudo (organizações, áreas, processos, créditos) é dessa conta.
- Isso depende do **login**. Recomendação: Supabase Auth (e-mail com link mágico e Google), pois já é o MVP no Supabase e o RLS passa a filtrar por membro. Enquanto não há login, tudo usa a conta padrão INC.

---

## Em aberto
- Autenticação: implementar o login (decisão 17 recomenda Supabase Auth)
- Integração com o Notion
