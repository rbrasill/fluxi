# Gravação de tela com marcação para o POP

## Objetivo
A pessoa grava a tela enquanto executa o processo no sistema e narra o que faz. Durante a gravação, ela clica em **"Incluir esta tela no POP"** nos momentos importantes. Cada clique captura a tela atual e vira um passo ilustrado do POP, com a instrução.

## Como funciona no navegador (pesquisa)
| Recurso | API | Suporte |
|---|---|---|
| Capturar a tela, janela ou aba | `navigator.mediaDevices.getDisplayMedia()` | Chrome, Edge, Firefox, Safari (desktop) |
| Microfone (narração) | `getUserMedia({ audio: true })` | todos |
| Juntar áudio da tela + microfone | Web Audio (`AudioContext` + `MediaStreamDestination`) | todos |
| Gravar o vídeo | `MediaRecorder` (WebM/VP9 no Chrome, MP4 no Safari) | todos |
| Tirar o "print" da tela no clique | desenhar o quadro atual do vídeo num `<canvas>` → PNG | todos |
| **Controle flutuante sobre qualquer janela** | **Document Picture-in-Picture** (`documentPictureInPicture.requestWindow()`) | **Chrome/Edge 116+, Firefox 151+**; Safari não |

O ponto-chave é o **Document Picture-in-Picture**: quando a pessoa está gravando outro sistema (ERP, CRM…), a aba do Fluxi fica escondida. O PiP abre uma **janelinha do Fluxi sempre por cima de tudo**, com os botões de controle, então ela consegue marcar a tela sem sair do sistema que está mostrando.

Sem PiP (Safari): os controles ficam na aba do Fluxi e a pessoa usa a gravação de **uma aba** ou divide a tela. Recomendação do MVP: Chrome ou Edge.

## Janela flutuante de controle
```
┌──────────────────────────────────────┐
│ ● REC 03:42          ⏸  ■ Encerrar   │
│ ┌──────────────────────────────────┐ │
│ │ 📷  Incluir esta tela no POP      │ │  ← botão principal, grande
│ └──────────────────────────────────┘ │
│ Instrução (opcional):                │
│ [Clique em "Nova proposta"…       ]  │
│ 3 telas marcadas                     │
└──────────────────────────────────────┘
```
- Ao clicar em **Incluir esta tela**: captura o quadro, marca o **tempo** na gravação e guarda a instrução digitada (se houver). Um "flash" e o contador confirmam.
- A instrução pode ficar vazia: depois, a IA escreve a instrução a partir da **narração** dos segundos ao redor da marcação (ex.: 10 s antes e 5 s depois).
- Atalho de teclado dentro da janela flutuante (Enter = incluir tela).

## Depois de encerrar
1. Vídeo e prints vão direto do navegador para o Supabase Storage (`tenants/{id}/gravacoes/…`), com link assinado.
2. O áudio é transcrito (AssemblyAI) com marcação de tempo.
3. A IA gera o fluxograma e o POP a partir da narração; cada tela marcada vira um **passo ilustrado** no procedimento correspondente, com:
   - o print (recortável depois);
   - a instrução digitada ou, se vazia, a sugerida pela IA com base na narração;
   - o trecho de tempo, para abrir o vídeo exatamente naquele ponto.
4. Tela de revisão: a pessoa confere, edita a instrução, reordena ou remove prints antes de gerar o POP.

## Dados (novas tabelas)
- `gravacoes`: tenant, processo/fluxograma, caminho do vídeo, duração, status (`gravando`, `enviando`, `transcrevendo`, `pronta`, `erro`), id da transcrição.
- `gravacao_marcacoes`: gravação, tempo (ms), caminho da imagem, instrução digitada, instrução da IA, ordem, incluída no POP (sim/não).

## Limites e cuidados
- **Tamanho:** no plano Free do Supabase, cada arquivo tem limite de 50 MB (≈ 10–15 min de tela em 720p). Para gravações longas: upload resumível (TUS) e plano Pro, ou gravar em 720p/baixa taxa de quadros (5–10 fps bastam para telas de sistema).
- **Privacidade (LGPD):** avisar antes de gravar; a pessoa escolhe a janela/aba; prints podem ter dados de clientes → opção de desfocar/recortar na revisão.
- O navegador sempre pede permissão para compartilhar a tela e usar o microfone.
- Créditos: gravar e marcar telas não consome crédito; transcrição e geração por IA, sim.
