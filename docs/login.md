# Login por código de e-mail (decisão 50)

Sem senha: a pessoa digita o e-mail corporativo (`@meuinc.com.br`), recebe um código de 6 dígitos por e-mail, digita o código e entra. A sessão dura 6 horas. Só entra quem um administrador cadastrou em **Pessoas e acessos**. Segue a especificação do login do Atylux, já com as correções da auditoria de 06/11/2026.

## Como funciona

| Parte | Faz |
|---|---|
| Servidor (`lib/server/login.ts`) | gera o código, guarda só o hash (sha256 de e-mail + código + segredo), valida, controla validade (10 min), tentativas (5), carência (60 s), uso único e limites por IP e por e-mail, e emite a sessão |
| Banco (`supabase/migrations/0018_login.sql`) | `pessoas`, `login_codigos`, `login_limites` e as funções atômicas `login_gravar_codigo`, `login_consumir_tentativa`, `login_usar_codigo` e `login_contar` (só o servidor pode chamá-las) |
| Carteiro (Pipedream ou outro) | recebe `{ email, nome, codigo }` e entrega o e-mail; não gera, não valida, não guarda nada |
| Porteiro (`proxy.ts`) | antes de toda página e rota: sem cookie válido, página vai para `/login?next=…` e API responde 401; escrita na API só vinda do próprio site (senão 403); sem `INC_AUTH_SECRET` em produção, 503 em tudo |
| Rotas | toda rota de dados confere a sessão de novo, agora com o banco (a pessoa ainda existe? a sessão não foi revogada?) |
| Sessão (`lib/auth/sessao.ts`) | cookie `inc_sessao` (HttpOnly, Secure em produção, SameSite=Lax, 6 h) com o token `payload.assinatura` (HMAC-SHA256) |

Rotas: `POST /api/auth/solicitar` `{ email }`, `POST /api/auth/validar` `{ email, codigo }`, `GET /api/auth/eu`, `POST /api/auth/sair`. Abertas sem login: `/login`, `/api/auth/*`, as páginas públicas (`/p/`, `/f/`, `/pr/`, `/api/publico/*`) e os arquivos estáticos por extensão.

Detalhes de segurança:
- A resposta do pedido de código é a mesma para e-mail cadastrado ou não (corpo, carência e tempo), para não revelar quem trabalha na empresa.
- A tentativa é consumida antes de comparar, num comando só: com pedidos em paralelo, no máximo 5 passam (testado no banco com 20 em paralelo).
- Comparações em tempo constante; código com gerador criptográfico; o código de uma pessoa não vale para outra.
- "Sair", remover a pessoa ou mudar o nível dela incrementa `versao_sessao`: os tokens antigos param de valer.
- O destino depois do login (`next`) só aceita caminhos do próprio site.
- Trocar o `INC_AUTH_SECRET` derruba todas as sessões (botão de pânico).

## Configuração (antes de promover para produção)

Sem isso, em produção o app inteiro responde 503 e ninguém consegue entrar.

1. **Gerar os dois segredos** (valores diferentes), por exemplo com `openssl rand -base64 48`:
   - `INC_AUTH_SECRET`: assina as sessões. Nunca sai do servidor.
   - `AUTH_MAILER_SECRET`: autentica o servidor junto ao carteiro.
2. **Montar o carteiro no Pipedream** (um workflow novo, só do INCFlow):
   1. `trigger`: HTTP / Webhook. Em *HTTP Response*, marque **"Return a custom response from your workflow"**. A URL do trigger é o `AUTH_MAILER_URL`.
   2. `validar_envio`: Node.js, com o código abaixo.
   3. `send_email_code`: ação de e-mail (Outlook/Microsoft 365 "Send Email", ou SMTP). Destinatário `{{steps.validar_envio.$return_value.email}}`, assunto "Seu código de acesso ao INCFlow", corpo HTML de `docs/login-email-codigo.html` (trocando `{{nome}}` e `{{codigo}}` pelos valores do step 2). Prefira uma caixa de serviço (ex.: `nao-responda@…`) como remetente.
   4. `return_response`: Node.js com `await $.respond({ status: 200, body: { ok: true } })`.
   - Em *Project → Variables*, crie `AUTH_MAILER_SECRET` (marcada como *Secret*) com o mesmo valor do servidor.
   - Em *Settings → Data Retention*, reduza a retenção ao mínimo (o histórico guarda o corpo, com o código).
3. **Na Vercel** (Settings → Environment Variables, em *Production* e *Preview*): `INC_AUTH_SECRET`, `AUTH_MAILER_URL`, `AUTH_MAILER_SECRET`.
4. **Cadastrar o primeiro administrador** no banco (depois disso, os outros pela tela "Pessoas e acessos"):
   ```sql
   insert into pessoas (tenant_id, nome, email, nivel)
   values ('00000000-0000-4000-8000-000000000001', 'Nome Sobrenome', 'nome.sobrenome@meuinc.com.br', 'admin');
   ```

Step `validar_envio`:

```js
import crypto from "node:crypto";

const DOMINIO = "@meuinc.com.br";

export default defineComponent({
  async run({ steps, $ }) {
    const recusar = async (status, motivo) => {
      await $.respond({ status, body: { ok: false } });
      return $.flow.exit(motivo); // encerra sem enviar; o motivo fica só no log do Pipedream
    };
    const esperado = process.env.AUTH_MAILER_SECRET || "";
    const recebido = String(steps.trigger.event.headers?.["x-inc-secret"] || "");
    const a = Buffer.from(recebido), b = Buffer.from(esperado);
    if (!esperado || a.length !== b.length || !crypto.timingSafeEqual(a, b)) return recusar(401, "Segredo inválido.");
    const corpo = steps.trigger.event.body || {};
    const email = String(corpo.email || "").trim().toLowerCase();
    const codigo = String(corpo.codigo || "");
    const nome = String(corpo.nome || "").trim() || email.split("@")[0];
    if (!email.endsWith(DOMINIO) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return recusar(400, "E-mail fora do domínio.");
    if (!/^\d{6}$/.test(codigo)) return recusar(400, "Código malformado.");
    // Não registre o código: $.export e console.log ficam visíveis no histórico.
    return { email, nome, codigo };
  },
});
```

## Desenvolvimento

- `npm run dev` sem `INC_AUTH_SECRET`: o app abre sem login (só em desenvolvimento).
- Com `INC_AUTH_SECRET` e sem `AUTH_MAILER_URL`: o código sai no log do servidor (nunca na resposta). Em produção isso é proibido (503).

## Testes (09/11/2026)

- Funções do banco no Postgres de verdade (dados de teste, apagados no fim): carência, cinco tentativas, 20 validações em paralelo (só 5 consumiram), uso único, vencimento, limites por janela, e a recusa para quem não é o servidor.
- Servidor (43 verificações, banco simulado): os critérios de aceite 1 a 17 da especificação, os limites por IP e por e-mail e as regras do cadastro de pessoas.
- Porteiro com o app em modo produção (19): 503 sem segredo, redirecionamento com o destino, 401 na API, estáticos e páginas públicas abertos, "/api/x/qualquer.svg" bloqueado, Origin de outro site 403, cookie adulterado, de outro segredo ou vencido.
- Telas (25): login em duas etapas, erros, carência do reenviar, destino, "Trocar e-mail", destino para fora, menu com nome e Sair, "Pessoas e acessos" só para administrador, cadastro, mudança de nível e remoção com confirmação, sessão que acaba no meio, celular.
