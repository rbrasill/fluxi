# Fluxi — Stack

Resumo da stack. Os motivos de cada escolha estão em [`decisoes.md`](decisoes.md) e a visão geral em [`arquitetura.md`](arquitetura.md).

## Front-end (Vercel)
- **Next.js** (App Router) + **React** + **TypeScript**
- **draw.io** embutido via `embed.diagrams.net` (edição dos fluxogramas)
- Gravação de tela e áudio no navegador (APIs nativas)
- **`@supabase/ssr`** para login com sessão em cookie

## Back-end (Vercel)
- **Node.js** + **Express 5** + **TypeScript**
- **Zod** (validação), **helmet**, **cors**, **express-rate-limit**, **pino-http** (logs)
- Tipos e schemas compartilhados em **`packages/core`** (inclui `env.ts`)

## Worker (Railway, Render ou Fly.io)
- **Node.js** + **TypeScript**
- **ffmpeg** (áudio e vídeo)
- **docxtemplater** (POP no modelo INC v3)
- Gerador próprio do **XML do draw.io** com a biblioteca de estilos BPMN

## Banco, arquivos e login
- **Supabase** no MVP: **PostgreSQL 17** com **RLS**, **Storage** e **Auth**
- **PostgreSQL 17 na Absam** previsto para produção

## Serviços externos
- **AssemblyAI** (Universal-3.5 Pro): transcrição com identificação de falantes
- **Claude Sonnet 5** via **API da Anthropic** (`@anthropic-ai/sdk`): extração do POP e do fluxograma
- **Notion**: publicação da documentação

## Multitenant
- `tenant_id` em todas as tabelas + RLS + camada de repositório que exige o tenant
- Arquivos em `tenants/{id}/...`

## A definir
- ORM: Prisma ou Drizzle
- Fila do worker: BullMQ + Redis ou `pgmq` no Supabase
- Pagamentos: Stripe, Asaas, Mercado Pago ou Pagar.me
- Detalhes da integração com o Notion
