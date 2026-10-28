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
5. **Gateway:** pergunta acima do losango; a saída para um destino abaixo usa a ponta de baixo quando a coluna está livre. Rótulos "Sim"/"Não" usam o Indicador de Caminho da biblioteca, presos à seta. O corredor depois de um gateway alarga quando a condição escrita é longa.

**Refazer no padrão INC** (menu Reorganizar do editor): nos fluxogramas gerados pela IA, monta o diagrama de novo a partir da estrutura original guardada (`fluxogramas.schema`). Pede confirmação, porque descarta as mudanças feitas à mão. As opções "Fluxo horizontal/vertical" são os layouts do próprio draw.io e não respeitam as raias.

## Estrutura do diagrama

- **Cabeçalho:** logo do tenant, nome do processo, descrição curta, caixa com o código do processo, botão "Acessar Documentação" (link para o POP) e selo de versão ("Atual").
- **Raias (pools horizontais):** uma por **área** ou papel que executa atividades, sem cabeçalho e com a etiqueta roxa da área no canto (como na biblioteca).
- **Tarefas:** retângulo arredondado, borda `#005F73`. Pode levar etiqueta de responsável quando executada por outra área dentro da raia.
- **Anotações:** caixas de apoio ligadas por linha tracejada (ex.: "Análise — Retorno entre 45 minutos e 3 horas"), alertas (ex.: "Obrigatório anexar tela...") e logos de sistemas utilizados (ex.: CV CRM).
- **Conectores:** ortogonais; sólidos e tracejados.

## Catálogo de elementos (biblioteca)

| Tipo (JSON) | Elemento | Cor principal |
|---|---|---|
| `inicio` | Início ("Início" no círculo; o gatilho escrito embaixo) | `#13AE84` |
| `inicio_mensagem` | Início por Mensagem | `#7AE2CF` |
| `inicio_condicional` | Início Condicional | `#306D29` |
| `fim` | Fim do Processo ("Fim" no círculo; o resultado embaixo) | `#F14F21` |
| `link_saida` | Evento de Link (Throwing) — continua em outro processo | `#006633` |
| `link_entrada` | Evento de Link (Catching) — iniciado em outro processo | — |
| `tarefa` | Caixa de Texto (retângulo arredondado) | borda `#005F73` |
| `gateway_exclusivo` | Gateway Exclusivo | `#fad7ac` / `#b46504` |
| `gateway_paralelo` | Gateway Paralelo | `#fad7ac` / `#b46504` |
| `gateway_inclusivo` | Gateway Inclusivo | `#fad7ac` / `#b46504` |
| `gateway_evento` | Gateway Baseado em Evento | `#fad7ac` / `#b46504` |
| rótulo `Sim` / `Não` | Indicador de Caminho | `#13AE84` / `#DB2843` |
| rótulo de evento | Caixa de Indicação de Evento Ocorrido | `#C13383`, `#0E8088`, `#093FB4` |
| `raia` | Swimlane / Pool + etiqueta da área | borda `#005F73`, etiqueta `#9FA1FF` |
| `conexao` | Seta ortogonal (espessura 2, losango na saída) | `#415A77` |
| pergunta do gateway | Caixa de Texto de Condição (acima do losango) | `#003049` |
| `nota` / `alerta` / `condicao` | Caixas de apoio (não interferem no fluxo) | — |
| `codigo_processo` | Caixa Informativa de Código do Processo | `#76ABAE` |

## Schema de extração (proposta)

```ts
const FluxoSchema = z.object({
  raias: z.array(z.object({ id: z.string(), area: z.string() })),
  nos: z.array(z.object({
    id: z.string(),
    tipo: z.enum([
      'inicio', 'inicio_mensagem', 'inicio_condicional', 'fim',
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
- **Fonte da verdade dos estilos:** a biblioteca (`biblioteca-estilos.xml`). Tarefas com borda `#005F73` e conectores `#415A77`.
