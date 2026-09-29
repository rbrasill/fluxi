# Fluxi — Arquitetura

```
┌──────────────────────────────┐
│          FRONT-END           │
│        Next.js + React       │  Vercel
│                              │
│  Páginas públicas (SEO):     │
│   landing, preços, cadastro  │
│  App logado (/app):          │
│   dashboard, formulários,    │
│   gravação, editor draw.io   │
└──────┬───────────────┬───────┘
       │ HTTPS / REST  │ upload direto (URL assinada)
       ▼               ▼
┌──────────────────────────────┐   ┌──────────────────┐
│           BACK-END           │   │ Supabase Storage │
│      Node.js + Express       │   │ tenants/{id}/... │
│                              │   └──────────────────┘
│  Autenticação (valida JWT)   │  Vercel
│  Regras de negócio           │
│  Tenants, usuários, membros  │
│  Processos, POPs, fluxos     │
│  Permissões (papéis)         │
│  Pagamentos (planos, uso)    │
│  Integrações e webhooks      │
└──────┬───────────────┬───────┘
       │               │ enfileira jobs
       ▼               ▼
┌──────────────┐  ┌──────────────────────────┐
│  PostgreSQL  │◀─│          WORKER          │  Railway/Render/Fly
│  (Supabase,  │  │  ffmpeg, transcrição,    │
│   RLS)       │  │  IA, POP (DOCX), draw.io │
└──────────────┘  └────────────┬─────────────┘
                               ▼
                     Serviços externos
     AssemblyAI · Anthropic (Claude) · Notion · Pagamentos
```

## Responsabilidades
- **Front (Next.js):** só interface. Nenhuma regra de negócio; toda leitura/escrita passa pela API. Chama o Supabase direto apenas para login (Supabase Auth) e upload de arquivos (URL assinada emitida pela API).
- **Back (Express):** fonte única das regras. Valida o JWT do Supabase Auth em toda requisição, resolve o tenant e o papel do usuário, e aplica permissões. Webhooks (AssemblyAI, pagamentos) chegam aqui.
- **Worker:** tarefas longas, fora da Vercel (limite de tempo das funções).
- **PostgreSQL:** dados com `tenant_id` e RLS como segunda trava.

## Autenticação
O Supabase Auth cuida de cadastro, login, recuperação de senha e SSO (ex.: Microsoft). O Express não guarda senhas: verifica o token emitido pelo Supabase e cuida da autorização (tenant, papel, permissões).

## Em aberto
- Provedor de pagamentos (ex.: Stripe, Asaas, Mercado Pago, Pagar.me).
- Fila do worker: BullMQ + Redis ou `pgmq` no Supabase.
