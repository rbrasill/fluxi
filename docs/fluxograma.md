# Fluxi — Fluxograma (draw.io)

- Biblioteca de estilos: [`templates/drawio/biblioteca-estilos.xml`](../templates/drawio/biblioteca-estilos.xml)

## Abordagem

Geração do XML do draw.io direto (não Mermaid), em duas camadas:

1. **IA (Claude)** devolve apenas a estrutura semântica do fluxo em JSON: raias, nós (tipo + texto + raia), conexões (com rótulo) e anotações.
2. **Código (`lib/fluxo/gerar-xml.ts`)** converte a estrutura em XML: aplica o estilo exato da biblioteca para cada tipo (`lib/fluxo/estilos.ts`), calcula posições e roteia as setas.

A IA não gera estilos nem coordenadas. As descrições (tooltips) da biblioteca entram no prompt como glossário de quando usar cada elemento (`lib/server/ia.ts`). O layout gerado é um rascunho organizado; o usuário refina no editor embutido.

## Layout automático (raias horizontais)

1. **Laços:** uma busca em profundidade a partir do início separa as setas de volta (ex.: "Não → corrigir e reenviar"). O resto vira um fluxo da esquerda para a direita.
2. **Colunas:** cada nó fica na coluna da **maior** distância desde o início. Assim toda seta de ida aponta para a direita, e uma junção fica depois de todos os caminhos que chegam nela. Nó sem entrada (ex.: link de outro processo) fica logo antes de quem ele alimenta.
3. **Trilhas:** dentro da raia, cada nó ocupa uma trilha (linha). O nó herda a trilha do antecessor na mesma raia; se ela estiver ocupada, desce para a próxima livre. O caminho principal segue reto e os desvios descem. A anotação reserva a célula logo abaixo do nó.
4. **Setas:** passam pelos corredores entre colunas e entre trilhas, nunca por cima de uma caixa. Seta reta quando a linha está livre; senão, curva no corredor. Saídas do mesmo nó (ou entradas no mesmo nó) dividem o trecho vertical, como um barramento; setas diferentes no mesmo corredor ficam lado a lado. Laço sai por baixo, volta pelo corredor abaixo da trilha e entra pela esquerda. Quando outro nó está colado à esquerda do destino, a seta entra por cima ou por baixo, para não parecer que sai desse vizinho.
5. **Gateway:** pergunta acima do losango; a saída para um destino abaixo usa a ponta de baixo quando a coluna está livre. Rótulos "Sim"/"Não" usam o Indicador de Caminho da biblioteca, presos à seta. As saídas do gateway baseado em evento usam as caixas de "Evento ocorrido". O rótulo fica junto da saída; quando duas saídas do mesmo nó partem pelo mesmo trecho (as duas descem, ou sobem pelo mesmo corredor), cada rótulo vai para a chegada da sua seta, para dar para saber qual é de qual. O corredor depois de um gateway alarga quando a condição escrita é longa.

**Refazer no padrão INC** (menu Reorganizar do editor): nos fluxogramas gerados pela IA, monta o diagrama de novo a partir da estrutura original guardada (`fluxogramas.schema`). Pede confirmação, porque descarta as mudanças feitas à mão. As opções "Fluxo horizontal/vertical" são os layouts do próprio draw.io e não respeitam as raias.

## Estrutura do diagrama

- **Cabeçalho:** logo do tenant, nome do processo, descrição curta, caixa com o código do processo, botão "Acessar Documentação" (link para o POP) e selo de versão ("Atual").
- **Raias (pools horizontais):** uma por **área** ou papel que executa atividades, sem cabeçalho, de cantos arredondados e com a etiqueta azul da área no canto (como na biblioteca).
- **Tarefas:** retângulo arredondado branco, borda `#A9BCD0`. Pode levar etiqueta de responsável quando executada por outra área dentro da raia.
- **Anotações:** caixas de apoio ligadas por linha tracejada (ex.: "Análise — Retorno entre 45 minutos e 3 horas"), alertas (ex.: "Obrigatório anexar tela...") e logos de sistemas utilizados (ex.: CV CRM).
- **Conectores:** ortogonais; sólidos e tracejados.

## Catálogo de elementos (biblioteca)

| Tipo (JSON) | Elemento | Cores (fundo / borda / texto) |
|---|---|---|
| `inicio` | Início ("Início" no círculo; o gatilho escrito embaixo) | verde: `#E7F6EE` / `#1EA65A` / `#178A4A` |
| `inicio_mensagem` | Início por mensagem | verde |
| `inicio_condicional` | Início condicional | verde |
| `inicio_paralelo` | Início paralelo múltiplo (só começa quando todos os eventos aconteceram) | verde |
| `fim` | Fim ("Fim" no círculo de borda grossa; o resultado embaixo) | vermelho: `#FDEDED` / `#E5484D` / `#D3383E` |
| `link_saida` | Link (saída): continua em outro processo | azul: `#E6F6FE` / `#12A3EB` / `#0B86C6` |
| `link_entrada` | Link (entrada): iniciado em outro processo | azul |
| `tarefa` | Caixa de texto (retângulo arredondado) | `#FFFFFF` / `#A9BCD0` / `#52637A` |
| `gateway_exclusivo` | Gateway exclusivo | amarelo: `#FFF8E3` / `#F2BE22` |
| `gateway_paralelo` | Gateway paralelo | amarelo |
| `gateway_inclusivo` | Gateway inclusivo | amarelo |
| `gateway_evento` | Gateway baseado em evento | amarelo |
| rótulo `Sim` / `Não` | Caminho "Sim" / Caminho "Não" | verde / vermelho |
| saída do gateway de evento | Evento ocorrido (as três caixas, alternadas) | azul, amarelo e neutro (`#FFFFFF` / `#A9BCD0` / `#7B8CA4`) |
| outra condição na saída | texto preso à seta | `#52637A` |
| `raia` | Swimlane de cantos arredondados + etiqueta da área | borda `#A9BCD0`, etiqueta `#12A3EB` com texto branco |
| `conexao` | Seta principal (1,5; bolinha na saída, ponta cheia na chegada) | `#12A3EB` |
| retorno (laço) | Seta secundária | `#A9BCD0` |
| pergunta do gateway | Condição do gateway (acima do losango) | `#1F1D5C` |
| `nota` | Caixa de texto, ligada por linha tracejada | `#FFFFFF` / `#A9BCD0` / `#52637A` |
| `alerta` | Alerta, com o triângulo de atenção | `#FFF8E3` / `#F2BE22` / `#7A5C00` |

Toda a biblioteca usa a fonte **Poppins** (carregada do Google Fonts pelo draw.io). Elementos da biblioteca que o gerador não usa, mas que ficam à mão no editor: Código do processo, Label de texto e Caixa de diálogo.

## Schema de extração (proposta)

```ts
const FluxoSchema = z.object({
  raias: z.array(z.object({ id: z.string(), area: z.string() })),
  nos: z.array(z.object({
    id: z.string(),
    tipo: z.enum([
      'inicio', 'inicio_mensagem', 'inicio_condicional', 'inicio_paralelo', 'fim',
      'link_entrada', 'link_saida', 'tarefa',
      'gateway_exclusivo', 'gateway_paralelo', 'gateway_inclusivo', 'gateway_evento',
    ]),
    raia: z.string(),
    texto: z.string(),
    responsavel: z.string().optional(),       // etiqueta quando executado por outra área
    procedimento: z.string().optional(),      // liga ao procedimento do POP
  })),
  conexoes: z.array(z.object({
    de: z.string(),
    para: z.string(),
    rotulo: z.string().optional(),            // "Sim", "Não", "Aprovar", "Pendência"...
  })),
  anotacoes: z.array(z.object({
    no: z.string(),
    tipo: z.enum(['nota', 'alerta']),
    titulo: z.string().optional(),
    texto: z.string(),
  })).optional(),
})
```

## Observações de formato

- Arquivo `mxfile` não comprimido, página A3 paisagem (1654×1169).
- Tarefas: `rounded=1`, `arcSize=16`, fonte Calibri 12. Alertas: `fillColor=#ffe6cc`, `strokeColor=#d79b00`. Anotações ligadas às tarefas por conector tracejado rosa `#FF3399`; fluxo principal com conector sólido ortogonal.
- **Imagens embutidas em base64** no XML aumentam muito o arquivo. No Fluxi, preferir referenciar as imagens por URL do storage.
- **Link "Acessar Documentação"** aponta para a documentação do processo: o código do processo é a chave que liga o fluxograma ao POP (e, no futuro, ao Notion).

## Edição e revisão (obrigatório)
A transcrição e a extração da IA podem errar, então **todo fluxograma gerado é um rascunho editável** antes de ser publicado.
- **Editor visual completo:** o draw.io embed (`embed.diagrams.net`) abre o XML gerado com a biblioteca de estilos BPMN carregada. O usuário move, cria e apaga elementos, reconecta setas e troca raias.
- **Ajuste por instrução:** o usuário descreve a mudança em texto ("a aprovação é do Jurídico, não do Financeiro") e a IA altera o **FluxoSchema** (não o XML). O código regera o diagrama, que volta para o editor para revisão.
- **Rastreio da transcrição:** ao selecionar uma tarefa, o painel mostra o trecho da transcrição (e o áudio, via `trechoAudio`) que a originou, para conferir se a IA entendeu certo.
- **Alertas de consistência** antes de publicar: gateway sem saída "Sim"/"Não", tarefa sem conexão, raia vazia, fluxo sem início ou fim.
- **Versões:** cada salvamento gera uma versão (XML + autor + data). Dá para comparar e restaurar. Publicar congela a versão e atualiza o POP e o Notion.
- **Edição manual preservada:** depois de uma edição manual no draw.io, o XML passa a ser a fonte da verdade. Um novo ajuste por instrução avisa que vai regerar o layout, e o usuário escolhe se aplica.
- **Sincronia com o POP:** renomear ou criar tarefas no fluxograma sugere a mesma mudança nos passos do POP, e o contrário também (o usuário confirma).

## Definições

- **Código do processo:** formato `XXXX-XXXX` (ver `docs/modelo-pop.md`).
- **Cores das raias:** fixas por área. Cada área recebe uma cor ao ser cadastrada no tenant, e essa cor se mantém em todos os fluxogramas.
- **Logos de sistemas:** não haverá cadastro de sistemas nem logos de sistemas nos fluxogramas gerados.
- **Fonte da verdade dos estilos:** a biblioteca (`biblioteca-estilos.xml`). Tarefas com borda `#A9BCD0` e conectores `#12A3EB` (decisão 62).
