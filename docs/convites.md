# Convites para entrevista com a Maia (decisão 53)

A entrevista com a Maia nasce dentro do processo, por convite: um administrador ou gestor escolhe até três pessoas cadastradas, e cada uma recebe um e-mail com o botão para abrir a sua entrevista. Só a pessoa convidada conversa com a Maia naquela entrevista.

O e-mail do convite sai por um **workflow próprio do Pipedream**, separado do que entrega o código de login (`docs/login.md`), com URL e segredo próprios. Assim um não mexe no outro.

## Como funciona

| Parte | Faz |
|---|---|
| Servidor (`lib/server/entrevistas.ts`) | cria a entrevista `convidada` para cada pessoa, com o tema (o nome do processo) e o contexto (organização, área, descrição do processo e a nota de quem convidou), e pede ao carteiro para entregar o convite; se o carteiro falhar ou não estiver configurado, o convite fica criado "sem e-mail" e dá para reenviar |
| Carteiro (`lib/server/carteiro.ts`) | manda `{ tipo: "convite", email, nome, processo, convidado_por, nota, link }` para `CONVITE_MAILER_URL`, com `CONVITE_MAILER_SECRET` no cabeçalho `x-inc-secret` |
| Workflow do Pipedream | confere o segredo, o domínio do e-mail e o link (só https, só para o host do app, só `/app/entrevistas/…`), e entrega o e-mail pelo Outlook (Graph API) |
| Link | `https://incflow.vercel.app/app/entrevistas/<id>`: a pessoa entra com o código de login e cai direto na entrevista; o endereço do app vem de `INC_APP_URL` ou da origem do pedido |

## Configuração

Sem isso, em produção os convites são criados mas ficam como "Convite sem e-mail": a tela avisa e, depois de configurar, o botão **Reenviar convite** manda o e-mail.

1. **Gerar o segredo** (diferente dos outros), por exemplo com `openssl rand -base64 48`: `CONVITE_MAILER_SECRET`.
2. **Montar o workflow no Pipedream** (um workflow novo, só para convites):
   1. `trigger`: HTTP / Webhook. Em *HTTP Response*, marque **"Return a custom response from your workflow"**. A URL do trigger é o `CONVITE_MAILER_URL`.
   2. `validar_convite`: Node.js, com o código de `docs/pipedream-convite-validar.js`. O nome do passo precisa ser exatamente `validar_convite`.
   3. `enviar_convite`: Node.js, com o código de `docs/pipedream-convite-enviar.js`. Em *Connect*, conecte a conta do Outlook que vai enviar (a mesma caixa de serviço do login serve). O e-mail segue o modelo da INC (`docs/convite-email.html`, para visualizar) e não deixa cópia nos Itens Enviados.
   4. `return_response`: Node.js com `await $.respond({ status: 200, body: { ok: true } })`.
   - Em *Project → Variables*, crie `CONVITE_MAILER_SECRET` (marcada como *Secret*) com o mesmo valor do servidor.
   - Em *Settings → Data Retention*, reduza a retenção ao mínimo.
3. **Na Vercel** (Settings → Environment Variables, em *Production* e *Preview*): `CONVITE_MAILER_URL` e `CONVITE_MAILER_SECRET`. Depois, Redeploy e promover.
4. **Testar:** abra um processo, clique em **Convidar para entrevista** e convide você mesmo. O e-mail chega em segundos, com o botão "Abrir a entrevista"; o Início passa a mostrar "A Maia está esperando você…".

## Regras

- Até **3 pessoas por convite**, uma entrevista por pessoa. Quem já tem entrevista aberta (convidada ou em andamento) naquele processo não recebe outra.
- Quem convida: **administrador ou gestor**. Quem liga para a Maia: **só a pessoa convidada** (o servidor confere a pessoa logada antes de abrir a sessão de voz; outra pessoa recebe 403). Administrador não liga no lugar dela.
- Enquanto a pessoa não começa, o convite pode ser **reenviado** ou **cancelado** (gestores e administradores).
- Entrevista que já começou (pausada, concluída ou com erro): só **administradores** excluem, e a exclusão leva tudo (conversa, áudio e resultado). Não dá para excluir com a pessoa na ligação nem com o resultado sendo gerado.
- **Ninguém edita a conversa nem o resultado** (decisão 54): a conversa é gravada só pela pessoa, durante a ligação; o resultado é da Maia. Administradores e gestores só geram de novo um resultado que falhou.
- O convite não tem validade. Lembretes automáticos ficam para depois, se forem necessários.

## Desenvolvimento

Sem `CONVITE_MAILER_URL`, o link do convite sai no log do servidor (`[convite] e-mail: link`) e o convite conta como enviado. Em produção isso não acontece: sem carteiro, o convite fica "sem e-mail".
