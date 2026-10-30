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
- **IA por créditos** (suspenso pela decisão 20)**:** cada empresa tem `creditos_ia`. Gerar fluxograma custa 1 crédito; transcrever áudio, 1. Débito atômico no banco (`debitar_creditos`) e registro em `uso_ia`. Sem créditos, a IA fica bloqueada e o usuário continua **criando manualmente**.
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
- A navegação (e, com o login, o acesso) segue: **Organização → Área → Processos da área → gravações, fluxogramas e POPs do processo**. A tela inicial passou a ser o Início, centrado no POP (decisão 21).
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

## 18. Marcações na tela (caixa, seta, número, texto, recorte)
- Em cada tela marcada dá para desenhar **caixa, seta, número (ordem dos cliques) e texto**, e **recortar**. Cor padrão vermelha (#E5252A), com amarelo, verde, azul e preto como alternativas. Desfoque ficou de fora por decisão do produto.
- **Onde:** na página da gravação (botão "Marcar" ou clique na imagem) e no passo do POP ("Marcar tela"). A marcação é **da tela da gravação**: editar num lugar muda nos dois e em todo POP que usa a tela.
- **Sem estragar o original:** o print fica intacto; as formas ficam em `gravacao_marcacoes.anotacoes` (pixels da imagem original), para reabrir e editar. Ao salvar, o navegador gera a imagem final (desenhada e recortada, na resolução original) e envia ao Storage; o POP e o DOCX usam essa versão (`imagem_anotada_caminho`, com largura e altura próprias por causa do recorte). A versão anterior é apagada a cada salvamento (`0009_marcacao_anotacoes.sql`).
- **Biblioteca:** react-konva (MIT), carregada só quando o editor abre. Descartado o marker.js (linkware/licença paga).
- **Não é possível** capturar onde a pessoa clicou durante a gravação: o navegador não informa cliques em outros programas. A **sugestão automática da caixa pela IA** (Claude localiza o elemento citado na instrução, ~US$ 0,005 por tela, sempre editável) fica para depois.

## 19. Modelo POP v3 (27/10/2026), PDF e fim dos exemplos
- **Modelo novo:** título "POP - Procedimento Operacional Padrão", ícones nas seções, faixa decorativa, "Históricos de Revisões" e procedimentos só como **print + caixa "Passo N:"** (sem a tabela de nome × tópicos). O template é regenerado do `.docx` original pelo script; trocar o modelo = trocar o arquivo e rodar `npm run modelo-pop`.
- **Campo novo "Elaborado por"** (`pops.autor`): quem criou o POP. Hoje a pessoa preenche; com o login, vem do usuário. Preenche as linhas do histórico sem nome.
- **PDF gerado pelo sistema** com pdfmake (MIT, JavaScript puro), e não por conversão do DOCX: na Vercel não há LibreOffice, e um serviço externo de conversão custaria por arquivo e dependeria de terceiro. O PDF reproduz o modelo (fonte Roboto no lugar da Aptos, que é proprietária). Os dois formatos saem do mesmo conteúdo (`DadosPop`), então mudanças de layout são feitas nos dois geradores.
- **Exemplos removidos:** o fluxograma de amostra ("Exemplo EmCash") e seus arquivos, e os textos de exemplo com nomes de empresa e área nas telas. O que fica são dicas genéricas ("Nome da área").

## 20. Créditos de IA suspensos
- **Por enquanto não há contagem nem limite de créditos.** A IA (gerar fluxograma, transcrever, gerar POP e fluxograma a partir da gravação) funciona sem verificar saldo e sem debitar. Saiu da tela o contador de créditos e os textos de custo.
- O controle de gasto fica nos painéis da Anthropic e do AssemblyAI (limites de uso por conta/workspace).
- **No banco nada foi apagado:** `tenants.creditos_ia`, a tabela `uso_ia` e a função `debitar_creditos` continuam lá, sem uso pelo app, para voltar com a cobrança por créditos quando entrar o plano comercial (substitui a parte de créditos da decisão 13).

## 21. Navegação centrada no POP
- **O produto final é o POP e a gestão dos POPs.** Gravações e fluxogramas são materiais de apoio para chegar ao POP, e a navegação passou a refletir isso; antes, era organizada pela estrutura (organizações, gravações, fluxogramas).
- **Início** (`/app/inicio`, a tela de entrada): números de POPs publicados, em rascunho e processos sem POP; "Continue de onde parou" (rascunhos recentes); processos sem POP, com atalho para documentar; botão "Documentar um processo".
- **Menu:** Início e POPs no topo; "Estrutura" (Organizações, que inclui áreas e processos); "Materiais de apoio" (Gravações, Fluxogramas); "Conta". No celular o menu vira uma barra no topo (antes sumia e não havia navegação).
- **POPs (gestão dos documentos):** busca por nome, identificação, código, área ou processo; filtro por status com contagem; cada linha mostra onde o POP está (organização · área · processo), versão, data, status e download em PDF e DOCX. Todo POP novo nasce num processo: o "Novo POP" pede o processo.
- **Status do POP:** rascunho ou publicado (`pops.status`), com o botão "Publicar" / "Voltar para rascunho" no editor. Ainda não gera versão nova ao publicar.
- **Página do processo começa pelo POP:** sem POP, mostra três caminhos (gravar a tela, recomendado; escrever o POP; começar pelo fluxograma); com POP, o POP em destaque com status e downloads. Gravações e fluxogramas ficam abaixo, como materiais de apoio.
- **Editor do POP:** trilha Organização › Área › Processo (POP sem processo pode ser vinculado ali) e o fluxograma só lista os do mesmo processo.
- **Gravação:** "Nova gravação" a partir do processo já vem com o processo escolhido. Com áudio pronto, a ação principal é gerar o POP com IA; "Criar POP sem IA" fica como secundária.

## 22. Layout do fluxograma gerado pela IA
- **Problema:** o fluxograma gerado pela IA saía embaralhado. Cada nó ia para a coluna da menor distância desde o início, então havia setas voltando para trás e cruzando caixas, textos cortados dentro dos círculos de início e fim e anotações por cima das raias. A biblioteca de estilos já era a da INC (`templates/drawio/biblioteca-estilos.xml`, a mesma do arquivo "instruções drawio"); o problema era o posicionamento.
- **Decisão:** layout em camadas próprio, pensado para raias horizontais (detalhes em `docs/fluxograma.md`): laços separados, coluna pela maior distância, trilhas dentro da raia e setas roteadas pelos corredores. Bibliotecas genéricas de layout (ELK, dagre) não tratam raias e ficariam pesadas no navegador; a do próprio draw.io também ignora raias.
- **Mais fiel à biblioteca:** etiqueta roxa da área, seta com losango na saída, Indicador de Caminho Sim/Não, pergunta do gateway como Caixa de Texto de Condição, "Início"/"Fim" no círculo com o texto embaixo, nota e alerta com os estilos da biblioteca.
- **IA:** o prompt passou a trazer o glossário da biblioteca (quando usar cada tipo de início, fim, link e gateway).
- **Fluxogramas já gerados:** "Refazer no padrão INC" no editor recria o diagrama a partir da estrutura original da IA, com confirmação (perde as edições manuais).

## 23. Pausar e retomar (gravação e POP) e prints anexados no POP
- **Gravação pausável entre sessões.** "Pausar" fecha a parte do vídeo em andamento e a envia na hora (antes, a pausa só segurava o MediaRecorder e a parte ficava na memória até encerrar). Com isso, o que foi gravado até a pausa está salvo mesmo que a aba feche. Na pausa aparece "continuar outro dia": libera a tela e deixa a gravação com status `pausada`.
- **Continuar de onde parou:** `/app/gravacoes/nova?continuar=<id>` reabre a tela e o gravador recebe o tempo já gravado e o índice da próxima parte; o relógio, as partes (`inicio_ms`) e as telas marcadas (`tempo_ms`) seguem em sequência, e o player toca tudo junto. Vale para gravação pausada, não finalizada (aba fechada no meio: status `gravando` sem aba aberta) e até pronta ("Continuar gravando", para acrescentar). A transcrição reaproveita as partes já transcritas. "Finalizar assim" marca como pronta sem compartilhar a tela de novo.
- **Telas novas no POP existente:** quando a gravação já tem POP (gerado pela IA ou criado "com estas telas") e ganha telas depois, a página da gravação oferece "Levar as telas para o POP": entram como passos de um procedimento novo no fim, sem gerar outro POP. Cada tela mostra o selo "No POP".
- **POP retomável no ponto exato.** O editor guarda onde a pessoa está (`pops.posicao`: `{ chave, rotulo }`, ex.: "Passo 3 do procedimento 2"), salvo 2 s depois de mudar de campo e ao sair da página, separado do autosave do conteúdo. "Pausar e sair" salva tudo, guarda a posição e volta ao processo. Os links "Continuar" (processo e Início) abrem com `?retomar=1`: a página rola até o campo, foca e destaca. Sem `?retomar`, um chip "Você parou em…" leva até lá. O Início lista também as gravações pausadas ou não finalizadas.
- **Prints anexados direto no POP.** Em qualquer passo: "Anexar print" / "Trocar print" / "Adicionar passo com print", com três caminhos: capturar uma janela agora (`getDisplayMedia` de um quadro só, encerrado em seguida), colar (botão com `clipboard.read()` ou Ctrl+V com o passo focado) ou escolher arquivo (PNG/JPG/WebP, convertido para PNG). O print pode ser marcado (caixa, seta, número, texto, recorte) como as telas da gravação.
- **Modelo de dados:** a tela do POP fica na mesma tabela das telas marcadas (`gravacao_marcacoes`), agora com dono `gravacao_id` **ou** `pop_id` (`tempo_ms` só nas da gravação) e arquivo em `tenants/<tenant>/pops/<pop>/`. As rotas de anotação e exclusão existem nas duas famílias (`/api/gravacoes/:id/marcacoes/:mid` e `/api/pops/:id/telas/:tid`) sobre o mesmo código (`lib/server/telas.ts`). Remover a imagem de um passo apaga o print do POP (o da gravação fica na gravação); excluir o POP apaga a pasta.

## 24. PDF fiel ao DOCX do modelo
- **Problema:** o PDF não seguia o DOCX. A faixa do topo saía laranja (no Word ela é cinza: o modelo aplica um efeito duotone com a cor do tema e 85% de opacidade); o espaçamento era cerca de 20% mais apertado (os parágrafos vazios que o modelo usa como espaçadores, a entrelinha de 1,5 do cabeçalho, as alturas mínimas e as margens das células não eram reproduzidos); o "negrito" era a Roboto Medium; a numeração dos envolvidos, as bordas e as faixas do histórico diferiam. (O DOCX que parecia "certo" na comparação era de antes do Modelo v3.)
- **Por que continua pdfmake e não conversão do DOCX:** converter com o Word ou o LibreOffice exigiria um servidor com esses programas (a Vercel não tem) ou um serviço pago de terceiro. Em vez disso, o gerador passou a seguir o modelo parágrafo por parágrafo, com as regras do Word medidas no PDF que o próprio Word exporta: linha de 1,222 × fonte × entrelinha, texto no topo da linha, espaçadores, margens de célula (108 twips), alturas mínimas e alinhamento vertical, deslocamentos das âncoras (ícones, réguas, faixa), moldura de 4 pt da logo, listas "1."/"A." com os recuos do modelo, Plain Table 1/2 e Table Grid Light. Conferido contra o DOCX renderizado: posições a poucos pontos e as mesmas quebras de página.
- **Efeitos de imagem do Word** (duotone, opacidade) são "assados" no PNG por `npm run modelo-pop`, lendo os parâmetros do próprio DOCX; se o modelo mudar, o PDF acompanha ao rodar o script.
- **Fonte:** Roboto (OFL), a fonte livre de largura mais próxima da Aptos (3% mais larga; a Inter, que o LibreOffice usa, é 9%). Negrito agora com a Roboto Bold.
- **Se um dia precisar ser idêntico ao Word:** converter o DOCX pelo Microsoft Graph (o Word da própria conta Microsoft 365 da INC gera o PDF) ou por um serviço de conversão; exige configuração no Azure ou custo por arquivo.

## 25. Mover o POP para outra área
- **Decisão:** a área do POP é a do processo dele, então mover o POP leva o **processo inteiro**, com tudo o que tem (os outros POPs, as gravações e os fluxogramas). A janela mostra o que vai junto antes de confirmar. Não há "só este POP": separar um POP do processo deixaria a gravação e o fluxograma dele para trás.
- **Onde:** botão "Mover" no editor do POP e na lista de POPs (`POST /api/pops/:id/mover`). A área pode ser de qualquer organização; o seletor de área da página do processo, que faz a mesma coisa, passou a listar também as áreas das outras organizações.
- **POP sem processo:** entra num processo da área escolhida, existente ou criado na hora.
- **Campo "Área" do documento:** acompanha a área nova quando estava em branco ou com o nome da área antiga; se a pessoa escreveu outra coisa, fica como está. Vale para todos os POPs do processo, também quando a área muda pela página do processo.

## 26. Confirmações e avisos no próprio site
- **Decisão:** nada de `confirm()`/`alert()` do navegador (mostram "fluxi-khaki.vercel.app diz", fogem do visual e travam a página). `confirmar({ titulo, mensagem, acao, perigo })` e `avisar(titulo, mensagem)` (`components/Dialogos.tsx`) abrem um diálogo do site e devolvem uma Promise; `<Dialogos />` fica no layout raiz e mostra um pedido de cada vez.
- **Comportamento de diálogo nativo:** o foco vai para o botão de ação e volta para quem pediu ao fechar; Esc cancela; Tab circula entre os botões; os atalhos da tela por baixo não recebem teclas (ex.: Delete no editor de marcação). Ações destrutivas têm o botão vermelho. Em tela cheia (editor de fluxograma), o diálogo é desenhado dentro do elemento em tela cheia.
- **Única exceção:** o aviso de "sair da página com alterações não salvas" continua sendo o do navegador; por segurança, nenhum site pode trocar esse.

## 27. Partes da gravação ilegíveis ("Transcoding failed")
- **Defeito:** na troca de parte (a cada 3 min), o gravador fechava o recorder antigo e abria o novo na hora, mas o último pedaço do antigo (até 1 s) só chega depois do `stop()`. Como os dois usavam a mesma lista de pedaços, esse pedaço entrava no começo da parte nova, antes do cabeçalho. Toda parte depois da primeira começava no meio do vídeo: nenhum programa abria (o AssemblyAI respondia "Transcoding failed... application/octet-stream (data)"), e a parte anterior perdia o último segundo. As partes depois de uma pausa não tinham o defeito (entre fechar e abrir há tempo para o pedaço chegar).
- **Correção do gravador:** cada recorder guarda os pedaços na própria lista. Conferido com o gravador de verdade no Chromium: todas as partes começam com o cabeçalho WebM e o ffmpeg lê todas.
- **Gravações já feitas:** antes de mandar para a transcrição ("Gerar POP" ou "Tentar de novo"), o Fluxi confere o começo de cada parte (1 MB). Se há uma sobra antes do cabeçalho, ela volta para o fim da parte anterior (de onde veio), e a parte ganha a duração no cabeçalho (`lib/gravacao/reparo.ts`). Os arquivos são substituídos no Storage, então o player também volta a tocar essas partes. Se o conserto parar no meio, rodar de novo não duplica nada.
- **Mensagem de erro:** diz qual parte falhou e a partir de que minuto, em português.

## 28. Borrar dados sensíveis nos prints
- **Decisão:** ferramenta **Borrar** (tecla B) no editor de marcação: a pessoa arrasta sobre nomes, CPF, e-mails etc. e a área vira um quadriculado. É manual, feito por quem elabora o POP; a IA não identifica nem borra nada.
- **Como:** o borrão é uma marcação como as outras (`tipo: 'borrar'`, em pixels da imagem original), então dá para mover, redimensionar, desfazer e reabrir depois. O quadriculado reduz a área a um pixel por quadrado (média das cores) e amplia sem suavizar; o quadrado tem 1/96 da largura do print (20 px num print de 1920 px), maior que uma letra. Os borrões ficam logo acima do print, e setas, caixas e números continuam visíveis por cima.
- **Onde vale:** na imagem marcada, que é a usada no editor do POP, no DOCX e no PDF. O print original continua guardado (para reabrir e editar as marcações) e não aparece no POP; o vídeo da gravação também não é alterado.

## 29. Formatação de texto no POP (objetivo e passos)
- **Decisão:** o objetivo e o texto de cada passo ganham uma barra de formatação no editor do POP (aparece por cima do campo enquanto se edita): negrito, itálico, sublinhado, tachado, cor do texto (6 cores), marca-texto (5 cores), lista com marcadores, lista numerada, tabela, limpar formatação, desfazer e refazer. Atalhos: Ctrl+B, Ctrl+I, Ctrl+U, Ctrl+Shift+S, Ctrl+Z; Tab passa para a próxima célula (na última, cria uma linha).
- **Tabela:** inserida pela grade (até 6 × 6), com a primeira linha como cabeçalho; o menu da tabela insere e exclui linhas e colunas, liga/desliga o cabeçalho e exclui a tabela. Colunas de largura igual e sem células mescladas (tabela colada de outro lugar entra sem mesclas): é o que sai igual nos dois formatos. No DOCX e no PDF: borda cinza fina (a mesma dos envolvidos), cabeçalho com fundo cinza e negrito, repetido no topo de cada página, e linhas que não se dividem entre páginas.
- **Fora, de propósito:** fonte, tamanho, títulos, emoji, links, imagens, vídeo e alinhamento. O modelo do POP define fonte e tamanho; prints entram pelo "Anexar print"; o resto não tem como sair igual no DOCX e no PDF.
- **Editor:** Tiptap 3 (ProseMirror), só com as extensões acima. O que se cola de outro lugar passa pelo mesmo filtro: o que não está na lista vira texto simples.
- **Formato salvo:** HTML restrito no mesmo campo de texto (`objetivo`, `passos[].texto`), sem mudar o banco: `<p>`, `<ul>`/`<ol>`/`<li>`, `<table>`/`<tr>`/`<th>`/`<td>`, `<br>`, `<strong>`, `<em>`, `<u>`, `<s>`, `<span style="color">` e `<mark data-color>`. Texto sem HTML (o que a IA escreve e os POPs antigos) continua valendo, uma linha por parágrafo. `lib/pop/texto-rico.ts` lê esse formato sem depender do navegador; tags e atributos fora da lista são descartados (só o texto fica) e cor só vale em `#rrggbb`/`rgb()`.
- **DOCX:** parágrafos e listas de verdade do Word (numeração própria no `numbering.xml`; cada lista numerada recomeça em 1), marca-texto como sombreamento do trecho. O objetivo passou a ser `{@objetivo}` no modelo (`npm run modelo-pop`). **PDF:** os mesmos trechos e listas no pdfmake (Roboto com itálico e negrito-itálico). Conferido lado a lado com o DOCX renderizado.

## 30. Melhorar os textos do POP com IA (Groq)
- **Decisão:** botão de IA (ícone de brilho, roxo) ao lado de cada passo e no título do objetivo. A IA corrige ortografia, gramática e pontuação e deixa o texto mais claro (imperativo, frases curtas, uma ação por frase), **sem inventar** passos, campos, valores ou nomes e mantendo nomes de sistemas, botões e telas como estão. A pessoa vê o texto atual e a sugestão lado a lado, com a lista do que mudou, e escolhe "Usar sugestão", "Manter o meu" ou "Gerar outra"; o "X" no canto e o Esc fecham a qualquer momento, até durante a revisão (a resposta que chegar depois é ignorada). Nada muda sem a escolha; depois de usar, Ctrl+Z no texto volta ao anterior.
- **Modelos:** Groq (API compatível com a da OpenAI, `https://api.groq.com/openai/v1/chat/completions`), `openai/gpt-oss-120b`; se falhar, `openai/gpt-oss-20b`. Conta como falha: limite de uso (429), Groq fora do ar (5xx, 498), demora acima de 25 s, resposta cortada ou fora do formato. Chave recusada (401/403) não tenta o reserva (é a mesma chave). Foi a Groq e não o Claude (que segue para POP e fluxograma) por ser uma tarefa curta, frequente e que pede resposta em 1 a 2 s.
- **Pedido:** uma mensagem só (a Groq recomenda não usar system prompt nos modelos de raciocínio), `reasoning_effort: low`, `include_reasoning: false`, `temperature` 0,3 e resposta em JSON com schema estrito (`texto` e `mudancas`). Vão como contexto o nome do POP, o do procedimento, o número do passo e o texto dos passos vizinhos (só para manter a coerência e a forma verbal).
- **Prompt ajustado aos POPs reais** (9 POPs, 110 passos, lidos em produção): os autores escrevem no imperativo ("Acesse") ou no infinitivo ("Acessar") e os dois aparecem em POPs publicados, então a IA **mantém a forma do autor** e só converte texto narrado ("acessamos", "seguimos") ou na voz passiva; números nos textos ("1 -", "4.") apontam os números marcados no print ou continuam a lista do passo anterior, então a IA **não renumera, não junta nem divide itens**; títulos dentro do passo ficam em linha própria (o primeiro em negrito); ficam como estão nomes de sistemas (RM, TOTVS, Fluig, Agidesk, eSocial…), códigos (S-2220, B31, NR-7), rótulos de tela em MAIÚSCULAS ou entre aspas, links e caminhos de pasta e de menu; textos que são só referência ao print ("2", "caminho pasta") voltam iguais; o objetivo não é encurtado. Três exemplos curtos (antes → depois) vão no prompt. Texto acima de 1.200 caracteres usa raciocínio médio.
- **Conferência dos termos:** mesmo instruída, a IA às vezes deforma um nome (num teste real, "Fluig" virou "FluFlig"). Por isso o servidor confere toda sugestão antes de mostrar (`lib/pop/termos-protegidos.ts`): links, textos entre aspas, códigos com números (S-2220, B31), palavras em MAIÚSCULAS e com maiúscula no meio (eSocial) precisam continuar no texto, e nenhuma palavra nova pode ser uma versão deformada desses termos ou de um nome com inicial maiúscula no meio da frase (Fluig, Agidesk, Salvar): uma letra trocada, letras a mais ou a menos. Acento corrigido, plural e frases juntadas (o nome aparecer menos vezes) não contam. Sugestão reprovada é descartada e o modelo reserva tenta; se os dois errarem, a pessoa vê o motivo (ex.: "“Fluig” virou “FluFlig”") e pode tentar de novo. Testado com 117 textos dos POPs reais e 12 respostas reais da IA, sem alarme falso.
- **Formatação:** o texto vai em HTML do editor (decisão 29) e a IA devolve no mesmo formato. A resposta passa pelo mesmo filtro do editor (`normalizarHtml`): só as tags e cores permitidas entram, então negrito, listas e tabelas se mantêm e nada perigoso passa.
- **Configuração:** `GROQ_API_KEY` nas variáveis de ambiente (Vercel). Sem ela, o botão avisa que a IA de texto não está configurada. No plano gratuito da Groq, os gpt-oss têm 30 pedidos e 8 mil tokens por minuto (cada revisão usa ~1 a 2 mil): o reserva tem limites próprios e ajuda nos picos.

---

## Em aberto
- Autenticação: implementar o login (decisão 17 recomenda Supabase Auth)
- Integração com o Notion
- Sugestão automática de marcação pela IA (decisão 18)
- Versão nova do POP ao publicar (decisão 21)
