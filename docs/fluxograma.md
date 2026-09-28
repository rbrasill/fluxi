# Fluxi — Fluxograma (draw.io)

- Biblioteca de estilos: [`templates/drawio/biblioteca-estilos.xml`](../templates/drawio/biblioteca-estilos.xml)
- Exemplo de resultado final: [`templates/drawio/exemplo-fluxograma-emcash.drawio`](../templates/drawio/exemplo-fluxograma-emcash.drawio) (fonte) e [`.pdf`](../templates/drawio/exemplo-fluxograma-emcash.pdf) (visual)

## Abordagem

Geração do XML do draw.io direto (não Mermaid), em duas camadas:

1. **IA (Sonnet 5)** devolve apenas a estrutura semântica do fluxo em JSON: raias, nós (tipo + texto + raia) e conexões (com rótulo).
2. **Código (`packages/drawio`)** converte a estrutura em XML: aplica o estilo exato da biblioteca para cada tipo, calcula posições e adiciona cabeçalho, rótulos e anotações.

A IA não gera estilos nem coordenadas. As descrições (tooltips) da biblioteca entram no prompt como glossário de quando usar cada elemento. O layout gerado é um rascunho organizado; o usuário refina no editor embutido.

## Estrutura do diagrama (a partir do exemplo)

- **Cabeçalho:** logo do tenant, nome do processo, descrição curta, caixa com o código do processo, botão "Acessar Documentação" (link para o POP) e selo de versão ("Atual").
- **Raias (pools horizontais):** uma por **área** (ex.: Comercial INC, ImobJF, EmCash), cada uma com etiqueta e cor de borda própria.
- **Tarefas:** retângulo arredondado, borda `#005F73`. Pode levar etiqueta de responsável quando executada por outra área (ex.: "Comercial" dentro da raia EmCash).
- **Anotações:** caixas de apoio ligadas por linha tracejada (ex.: "Análise — Retorno entre 45 minutos e 3 horas"), alertas (ex.: "Obrigatório anexar tela...") e logos de sistemas utilizados (ex.: CV CRM).
- **Conectores:** ortogonais; sólidos e tracejados.

## Catálogo de elementos (biblioteca)

| Tipo (JSON) | Elemento | Cor principal |
|---|---|---|
| `inicio` | Início | `#13AE84` |
| `inicio_mensagem` | Início por Mensagem | `#7AE2CF` |
| `inicio_condicional` | Início Condicional | `#306D29` |
| `fim` | Fim do Processo | `#F14F21` |
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
| `conexao` | Seta ortogonal (espessura 2) | `#415A77` |
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

## Observações do arquivo de exemplo (`.drawio`)

- Arquivo `mxfile` não comprimido, 1 página A3 paisagem (1654×1169), 162 elementos.
- **Estilos reais diferem da biblioteca em alguns pontos:**
  - Tarefas e conectores usam `#264653` (a biblioteca define `#005F73` para tarefas e `#415A77` para conectores).
  - Tarefas: `rounded=1`, `arcSize=16`, fonte Calibri 12.
  - Alertas: `fillColor=#ffe6cc`, `strokeColor=#d79b00`.
  - Anotações ligadas às tarefas por conector tracejado rosa `#FF3399`; fluxo principal com conector sólido ortogonal.
  - Raias com cor de borda por área: `#FB8500` (Comercial INC), `#006600` (ImobJF), `#0000FF` (EmCash).
- **Imagens (logos) embutidas em base64** no XML (6 imagens), o que aumenta o arquivo (~245 KB). No Fluxi, preferir referenciar as imagens por URL do storage.
- **Link "Acessar Documentação"** aponta para `https://notion.meuinc.com.br/{codigo-do-processo}`: o código do processo é a chave que liga o fluxograma à documentação no Notion.

## Definições

- **Código do processo:** mantém o formato `XXXX-XXXX` (ver `docs/modelo-pop.md`). O `VE7QGM098T` do exemplo é legado.
- **Cores das raias:** fixas por área. Cada área recebe uma cor ao ser cadastrada no tenant, e essa cor se mantém em todos os fluxogramas.
- **Logos de sistemas:** não haverá cadastro de sistemas nem logos de sistemas nos fluxogramas gerados.

## Em aberto

1. Qual é a fonte da verdade para as cores de tarefas e conectores: a biblioteca (`#005F73` / `#415A77`) ou o arquivo real (`#264653`)?
