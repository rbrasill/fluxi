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

---

## 1. Back-end em Node.js
Uma linguagem só (TypeScript) no front e no back, com tipos compartilhados entre eles.

## 2. Express como framework da API
Escolhido por ser familiar. Complementos: `multer` (uploads), Zod (validação), `helmet`, `cors`, `express-rate-limit`, `pino-http`.

## 3. Multitenant desde o início
- Proposta (a confirmar): banco compartilhado com `tenant_id` + Row Level Security no Postgres.
- Usuário pode pertencer a vários tenants (tabela `Membership`).
- Arquivos, jobs de fila, integrações e limites de uso sempre separados por tenant.

## 4. Transcrição com AssemblyAI
- Recursos: `speaker_labels`, `language_code: 'pt'`, timestamps, `word_boost` por tenant, redação de PII.
- Fluxo assíncrono via webhook, validado por segredo.
- Uso contabilizado por tenant; a transcrição é apagada no AssemblyAI depois de salva no Fluxi.

## 5. draw.io via `embed.diagrams.net`
- Editor em iframe (`embed=1&proto=json`), com comunicação por `postMessage`.
- Fluxo: `init` → `load(xml)` → `autosave`/`save` → `export(png/svg)` para o POP.
- O XML fica no Postgres do Fluxi (com `tenant_id` e versão); o draw.io não armazena nada.
- Licença Apache 2.0.
- **Futuro:** migrar para draw.io auto-hospedado (`jgraph/docker-drawio`) quando clientes exigirem que os diagramas não saiam da infraestrutura do Fluxi.

---

## Em aberto
- LLM para extração das etapas
- Autenticação (Clerk, Supabase Auth ou própria)
- Geração do fluxograma: XML do draw.io direto ou Mermaid → importação
- Detalhes do modelo de POP (ver `docs/modelo-pop.md`)
- Integração com o Notion
