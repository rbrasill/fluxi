# draw.io — modo embed (referência para o Fluxi)

Fonte: documentação oficial (drawio.com/doc/faq/embed-mode e /configure-diagram-editor), consultada em 2026-09-29.

## Como o editor é carregado
iframe apontando para `https://embed.diagrams.net/` (o único domínio que aceita embed) com:

| Parâmetro | Uso no Fluxi |
|---|---|
| `embed=1` | obrigatório |
| `proto=json` | mensagens em JSON via `postMessage` |
| `configure=1` | o editor espera nossa configuração (biblioteca, cores) antes de iniciar |
| `libraries=1` | mostra o painel de formas (com a biblioteca BPMN INC) |
| `noExitBtn=1` | sem botão "Sair": a tela do Fluxi controla a navegação |
| `spin=1` | spinner enquanto carrega |
| `lang=pt-br` | interface em português |

## Sequência de mensagens
```
editor → {event:'configure'}
host   → {action:'configure', config:{...}}        (biblioteca, cores, estilos padrão)
editor → {event:'init'}
host   → {action:'load', xml, autosave:1, title, exportProtocol:true}
editor → {event:'load', modelBounds, checksum}
editor → {event:'autosave', xml}                    (a cada alteração)
editor → {event:'save', xml}                        (botão Salvar)
host   → {action:'export', format:'xmlsvg'|'png'}   (para POP e Notion)
editor → {event:'export', data:'data:...', xml}
```

## Configuração enviada (`configure`)
- **`libraries`**: a biblioteca `templates/drawio/biblioteca-estilos.xml` (formato `<mxlibrary>`), convertida para o formato `{title, entries:[{id, title, libs:[{title, data:[{xml,w,h}]}]}]}`. Carregada como biblioteca "BPMN INC", aberta por padrão (`defaultLibraries`).
- **`defaultEdgeStyle`**: conector ortogonal, largura 2, `#415A77` (padrão da biblioteca).
- **`defaultVertexStyle`**: fonte e borda `#005F73` das tarefas.
- **`customPresetColors`**: cores da biblioteca + cores fixas das raias do tenant.
- **`compressXml: false`**: o XML fica legível no banco, para indexar os nós (`fluxograma_nos`) e comparar revisões.
- **`css`**: ajustes visuais para combinar com o tema do Fluxi.

## Ações úteis
| Ação | Uso no Fluxi |
|---|---|
| `load` | abrir o XML da versão |
| `merge` | aplicar um ajuste da IA sem recarregar o editor (inserir/alterar elementos) |
| `export` `xmlsvg` | SVG com o diagrama embutido: imagem para o POP/Notion que continua editável |
| `export` `png` (`scale`, `border`) | imagem para o DOCX do POP |
| `layout` (`horizontalFlow`…) | botão "Reorganizar layout" |
| `viewbox` / `fit` | "Ir para o 1º" alerta: centraliza o elemento problemático |
| `status`, `spinner`, `dialog` | mensagens do Fluxi dentro do editor ("Salvo", "Aplicando ajuste…") |
| `textContent` | texto do diagrama (busca e conferência com o POP) |

## Diff sync (para depois)
Com `diffSync:true` no `load`, o `autosave` passa a mandar só um **patch** (`u` atualizar, `i` inserir, `r` remover) e um **checksum**. Serve para edição simultânea por várias pessoas e para gravar menos dados. Em caso de checksum diferente, `resetDiff` ou `merge` ressincronizam. No MVP usamos o XML completo; diff sync entra com a colaboração em tempo real.

## Limitações e cuidados
- O editor roda no domínio da jgraph: o XML trafega pelo navegador do usuário, mas **não é salvo** por eles. Clientes que exigirem isolamento total → self-host (`jgraph/docker-drawio`), mesma API.
- `load` também aceita Mermaid e CSV, mas o Fluxi gera XML direto (decisão 8).
- O editor só funciona no navegador: no Next.js fica num componente `"use client"` com import dinâmico.
- Validar a origem (`event.origin === 'https://embed.diagrams.net'`) em toda mensagem recebida.
