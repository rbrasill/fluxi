# Maia: entrevista por voz com IA (registro até 09/11/2026)

A Maia é a entrevistadora por voz do INCFlow: conversa ao vivo com quem executa um processo e, no fim, entrega a descrição do processo, uma ficha com as etapas e a lista do que ficou em aberto. Fica no menu **Conversas com a Maia** (`/app/entrevistas`, decisão 60: quem é comum vê só as suas conversas, com o processo e a data e hora de cada uma) e não cria nem altera processos sozinha; o que a pessoa contou pode virar o fluxograma do processo pelo diálogo "Gerar com IA" (decisão 63). A história completa está nas decisões 39 a 60 (`docs/decisoes.md`); este documento junta o estado atual.

## O que ela faz hoje

- **Conversa natural, nos dois sentidos ao mesmo tempo.** Ouve enquanto fala, para na hora quando a pessoa fala por cima, encaixa sinais de escuta ("aham", "certo", "faz sentido"), ri, responde rápido (mediana de 0 a 0,2 s nos últimos testes).
- **Quem é:** "Oi, Ana! Eu sou a Maia, trabalho com o Rafael Brasil, na área de processos da Ínqui. Essa conversa fica gravada, tá? Pra começar…". Chama a pessoa logada pelo primeiro nome (decisão 50). Se perguntarem, diz que é uma inteligência artificial.
- **Como conduz:** começa pela visão geral e pelo início do processo, percorre as etapas na ordem e, em cada uma, descobre quem faz, com que sistema, o que entra e o que sai. Aprofunda respostas vagas, pergunta o que acontece em cada caminho de uma decisão, confirma o que entendeu com resumos curtos e não repete perguntas já respondidas. Quando a pessoa não sabe uma parte ("isso é com a outra área"), foca no que ela sabe e o resto vira pendência.
- **Tópicos que procura cobrir:** objetivo, início (gatilho e frequência), etapas, responsáveis, ferramentas, entradas, saídas, regras (prazos, alçadas, aprovações), exceções e dificuldades.
- **Pesquisa na hora:** quando a pessoa pergunta "você sabe o que é o RM da TOTVS?" (ou ela precisa entender um termo), diz "deixa eu ver aqui", o Claude Sonnet responde em poucos segundos e ela explica em uma ou duas frases, voltando ao processo. Só conhecimento geral: sobre o processo da pessoa, quem sabe é a pessoa.
- **Conhece quem fala:** na abertura pergunta de qual área a pessoa é e o que faz (decisão 67); nas entrevistas seguintes da mesma pessoa, já sabe e não repete.
- **Pontos em aberto que fecham:** quando a pessoa volta para responder o que ficou em aberto, a lista só diminui: o que foi respondido sai e nada novo entra (decisão 66).
- **Não encerra com lacunas.** A entrevista termina quando os tópicos estão cobertos, não pelo tempo. Antes do resumo final, confere o que falta (reprovação, prazos, participantes, frequência, problemas). "Acho que é isso" depois de um resumo não é pedido para encerrar.
- **Quando a pessoa precisa sair:** diz o que falta e pede quatro perguntas rápidas; se a pessoa topar, faz as quatro e cumpre o combinado. Se ainda faltar algo, despede-se com "a gente continua depois" e a entrevista fica **Pausada**; se cobriu tudo, "vamos concluir por aqui". Se a pessoa não puder, pausa na hora, sem insistir.
- **Ela mesma desliga a chamada.** "Vamos concluir por aqui" encerra e gera o resultado; "a gente continua depois" desliga e deixa a entrevista aberta. Ao continuar, ela retoma mostrando que lembra ("que bom que você voltou", onde pararam, o que faltava); se for outra pessoa, apresenta-se e pergunta o nome.
- **Troca de pessoa no meio:** no teste da compra de terrenos, a pessoa foi chamar o Ronaldo; ela esperou em silêncio, cumprimentou o Ronaldo pelo nome e retomou a pergunta.

## O que sai no fim

O Claude Sonnet 5.5 lê a conversa inteira e escreve:
- **Descrição** do processo (dois a cinco parágrafos, tom de documento).
- **Ficha:** objetivo, gatilho, resultado e as etapas na ordem, cada uma com responsável, descrição, ferramentas, entradas, saídas, regras e exceções; dificuldades relatadas.
- **Pendências:** o que ficou sem resposta, escrito como perguntas para a próxima conversa.

Regras da análise: corrige nomes pela transcrição sem inventar; falas ditas por cima da IA valem como correção; o que a Maia explicou depois de pesquisar não vira fato do processo; o nome da empresa sai escrito **INC**.

## Como funciona por dentro

| Parte | Como |
|---|---|
| Voz | OpenAI **GPT-Live** (`gpt-live-1`), o modelo *full duplex* (não a Realtime API, que é por turnos). O navegador fala direto com a OpenAI por WebRTC; voz `bossa` (pt-BR) |
| Abrir a sessão | `POST /api/entrevistas/:id/sessao`: o servidor chama `POST /v1/live/sessions` com a chave (que não vai para o navegador), as instruções da Maia e, ao continuar, o histórico |
| Condução | Só pelas instruções da sessão (`instrucoesDaSessao` em `lib/server/entrevistas.ts`), no esqueleto do guia do GPT-Live: papel, jeito de falar, `Backchannel policy`, `Interruption policy`, `Delegation policy`, tópicos, condução e encerramento |
| Pronúncia | O modelo fala do jeito que lê: tudo o que ela lê traz "Ínqui" escrito (instruções, tema, contexto, histórico); nada de "INC" |
| Pesquisa | `session.delegation.created` → o navegador manda o fim da conversa para `POST /api/entrevistas/:id/consulta` → Claude Sonnet 5.5 → a resposta volta por `session.commentary.append` |
| Conversa e métricas | Os pedaços de transcrição dos dois lados viram a conversa no navegador (`lib/entrevista/conversa.ts`), guardada a cada 15 s e no fim (`PUT …/conversa`) |
| Gravação | Os dois lados num arquivo por sessão, no Storage (`tenants/<t>/entrevistas/<id>/conversa-<n>.webm`) |
| Resultado | `POST …/encerrar`: Claude Sonnet 5.5 com saída estruturada |
| Tela | Esfera animada (`components/entrevista/Orbe.tsx`), legenda fixa, tempo, oito indicadores, botões Pausar e Encerrar |
| Servidor | Vercel em São Paulo (`gru1`), junto do Supabase (`sa-east-1`) |

Arquivos principais: `lib/server/entrevistas.ts` (instruções, sessão, consulta, análise), `lib/entrevista/motor.ts` (WebRTC, eventos, pausa, proteções de custo), `lib/entrevista/conversa.ts` (transcrição e métricas), `lib/entrevista/topicos.ts` (tópicos, tipos, custos), `app/app/entrevistas/` (telas), `app/api/entrevistas/` (rotas). Banco: tabela `entrevistas` (migrações 0016 e 0017).

## Custos

| Item | Preço | Num teste de 5 min |
|---|---|---|
| Voz (GPT-Live) | US$ 0,05 por minuto de sessão aberta, cobrado por segundo | US$ 0,25 (cerca de 90% do total) |
| Análise no fim (Claude Sonnet 5.5) | US$ 2 / 10 por milhão de tokens | US$ 0,02 a 0,03 |
| Pesquisas (Claude Sonnet 5.5, decisão 59) | US$ 2 / 10 por milhão de tokens | cerca de US$ 0,01 cada |

Os testes custaram de US$ 0,13 a 0,42; uma entrevista de 20 minutos sai por volta de US$ 1,05.

**Proteções para a sessão nunca ficar ligada sem uso** (a voz é cobrada pelo tempo aberto, falando ou não): pausar e encerrar fecham a sessão e esperam a confirmação da OpenAI; pausa sozinha se ninguém falar por 2 minutos, se a conexão cair (aconteceu em 07/11 e funcionou) e no teto de 45 minutos por sessão; sair da página fecha a sessão. O painel mostra quantas sessões foram desligadas com confirmação.

## Indicadores acompanhados

No **Painel da Maia** (menu, só administradores; decisão 52), para cada entrevista: reação da IA (mediana e máxima), falas por cima da IA, tempo de fala de cada lado, sinais de escuta (e quantas vezes cada um, para ver vício), maior silêncio, pesquisas (quantas, espera e custo), custo da voz, da análise e total; nos detalhes, as etapas da conexão (microfone, conexão, servidor e OpenAI, início da sessão) e o tempo até ela começar a falar. O painel mostra o acumulado de todas as entrevistas, o resumo por mês e como a Maia está configurada. Quem é entrevistado vê só a ligação e o resultado, sem números.

## Testes reais

| Data | Tema | Duração | Custo | O que mudou depois |
|---|---|---|---|---|
| 07/11 | Pedido de pagamento de fornecedor | 8,5 min | US$ 0,42 | Esfera animada, menos passiva, frase final mantida (42) |
| 07/11 | Contratação de pessoas na obra | 3 min | US$ 0,15 | Parar na hora quando falam por cima, ritmo, indicadores de custo (43) |
| 07/11 | Vale alimentação de novos colaboradores | 5 min | US$ 0,27 | Pesquisa com o Claude, despedida natural, pronúncia (44) |
| 07/11 | Transferência de colaborador entre áreas | 7 min | US$ 0,38 | Nome, cobrir lacunas antes de encerrar, abertura curta (45) |
| 07/11 | Compra de terrenos | 5 min | US$ 0,27 | Pausar e continuar depois, custo parado, sinais variados (46) |
| 07/11 | Contratar fornecedor | 5 min | US$ 0,28 | Quatro perguntas antes de pausar, conexão (47) |
| 08/11 | Remoção de resíduos do canteiro de obra | 3 min | US$ 0,17 | "Ínqui" escrito como se fala, Maia (48) |
| 09/11 | Aprovação no sistema Approvo | 2 min | US$ 0,13 | Primeiro teste da Maia: disse "Ínqui" e se apresentou certo |

## Números da conexão (do clique até a voz)

| Teste | Microfone | Conexão | Servidor (OpenAI) | Início da sessão | Total |
|---|---|---|---|---|---|
| 07/11 (antes de São Paulo) | – | – | – | – | 7,5 s e 15,2 s |
| 07/11 22h | 5,9 s | 0,2 s | 3,0 s (0,8 s) | 1,3 s | 10,4 s |
| 08/11 | 3,2 s | 0,2 s | 1,5 s (1,0 s) | 1,0 s | 5,9 s |
| 09/11 Approvo | 5,6 s | 1,2 s | 1,1 s (0,4 s) | 1,0 s | 8,9 s |
| 09/11 Compra de terreno | 2,0 s | 0,2 s | 0,9 s (0,5 s) | 1,2 s | 4,4 s |

Depois da sessão começar, ela fala em 0,4 a 0,8 s. O servidor ficou em cerca de 1 s; **o microfone é a maior espera (2 a 6 s)**, provavelmente o navegador pedindo permissão ou um fone Bluetooth trocando de modo.

## Entrevistas por convite, dentro do processo (decisões 49 e 53; fase 1 feita em 09/11/2026)

A fase 1 está implementada: convite pelo processo (até três pessoas, uma entrevista por pessoa), e-mail pelo carteiro, só a pessoa convidada liga, seção "Entrevistas com a Maia" no processo, aviso no Início. A fase 2 é a síntese das entrevistas do processo. O texto abaixo é o registro da decisão original.

### Registro original (decisão 49)

Decidido em 09/11, a implementar depois do login:
- A entrevista só acontece por **convite**: o administrador cria a entrevista (processo e contexto) e convida a pessoa; ela recebe um **e-mail** com o convite, entra na plataforma com **login** e inicia. Se não fizer, a entrevista fica **pendente**.
- Motivos: **custo** (só o convidado abre sessão de voz) e **saber exatamente quem** foi entrevistado.
- Só o convidado, logado, abre a sessão da sua entrevista; o servidor confere antes de chamar a OpenAI.
- A Maia **chama a pessoa pelo nome** (e pode usar cargo e área, se vierem no convite).
- O administrador acompanha os status: pendente, em andamento, pausada, concluída; o resultado mostra quem foi entrevistado.
- A definir junto com o login: serviço e texto do e-mail, validade do convite, lembretes e se o convidado vê o resultado.
- **Login feito (decisão 50, `docs/login.md`):** código por e-mail, só para quem está em "Pessoas e acessos". A entrevista já guarda quem foi entrevistado e a Maia já chama pelo nome. Falta o convite em si.

## Pontos em aberto e próximos ajustes sugeridos

1. **Acesso:** resolvido pelo login (decisão 50) quando for para produção: sem sessão, nenhuma rota abre sessão de voz. Falta o convite (decisão 49), para só o convidado iniciar a própria entrevista.
2. **Microfone na abertura:** ligar o microfone quando a pessoa marca a ciência (antes de "Começar") tiraria de 2 a 6 s da espera; abrir a sessão enquanto o microfone liga tiraria até 1,5 s.
3. **"Pode encerrar a entrevista":** no teste do Approvo, a pessoa disse isso com lacunas em aberto e ela encerrou na hora, sem oferecer as quatro perguntas (a instrução trata "quero encerrar de vez" como pedido para não insistir). Pela regra combinada (só não insistir se a pessoa repetir), a primeira vez deveria oferecer as perguntas.
4. **A análise deduz cargos:** "Financeiro (Paula)" e "Analista de novos negócios (Ronaldo)" sem ninguém ter dito; o certo é registrar o que foi dito e pôr o resto em pendência.
5. **Transcrição:** às vezes aparece um "?" solto no começo de uma fala, e falas longas da pessoa com pausas maiores que 1,5 s ficam quebradas.
6. **Mais de uma pessoa:** a conversa não separa quem falou do lado de lá (no teste do Ronaldo, a análise acertou pelo contexto).
7. **Fechar a sessão pelo servidor:** a OpenAI não permite (o endereço de sessões só aceita WebSocket); quem garante o fechamento é o navegador.
8. **Persona fixa:** nome, "Rafael Brasil" e "Ínqui" estão escritos no código; para outras empresas, viram configuração da organização.
9. **Depois do login e do convite:** usar o resultado para criar o processo, a descrição e o fluxograma (e depois o POP), como combinado no começo; talvez entrevistas pelo Meet ou Teams.
10. **Chaves:** revogar a chave da OpenAI e o token do Supabase usados nesta fase quando ela terminar, e criar novas.
