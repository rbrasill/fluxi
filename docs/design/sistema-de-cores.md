# Sistema de cores do INCFlow (redesign, decisão 75)

Definido pelo Rafael em 12/11/2026, junto com o redesign de toda a plataforma. A referência original está em
`docs/design/referencias/sistema-de-cores.webp`. As variáveis estão em `app/globals.css` (`--indigo-700` e
outras); elas vão sendo aplicadas tela a tela, à medida que o redesign avança.

A ideia: quatro famílias, cada uma com um papel fixo, para a cor sempre significar a mesma coisa. **Índigo é ação,
teal é a Maia, verde é concluído, rosa e pêssego pedem atenção.**

## Proporção em cada tela

A interface é quase toda neutra: **neutros 80%**, **índigo 12%**, e o resto em pequenas doses de teal, verde e
rosa, que só aparecem quando têm algo a dizer (IA, estado concluído, alerta).

## As quatro famílias

Na coluna "Uso": **Texto** = contraste de 4,5:1 ou mais sobre o branco; **Ícone** = de 3:1 a 4,5:1, serve para
ícones, pontos e gráficos; **Fundo** = abaixo de 3:1, só como superfície ou preenchimento.

### Índigo · marca e ação

Botões primários, links, abas, menu ativo, seleção e foco. É a cor do INCFlow.

| Tom | Cor | Uso | Contraste |
|---|---|---|---|
| 950 | `#1E1B4B` | Texto (e o botão primário ao passar o mouse) | 16,0:1 |
| 700 | `#4338CA` | Texto, botão primário | 7,9:1 |
| 500 | `#6366F1` | Ícone | 4,4:1 |
| 300 | `#A5B4FC` | Fundo (o anel de foco) | |
| 100 | `#E0E7FF` | Fundo (o item ativo do menu) | |
| 50 | `#F8FAFF` | Fundo | |

### Teal · Maia e IA

Tudo o que a Maia faz ou sugere: entrevistas, "Melhorar com IA", "Gerar de novo com IA", geração de fluxogramas,
Conversas com a Maia e o Painel da Maia.

| Tom | Cor | Uso | Contraste |
|---|---|---|---|
| 900 | `#0F4C5C` | Texto | 9,5:1 |
| 700 | `#187C81` | Texto, botão sólido teal | 5,0:1 |
| 500 | `#2A9D8F` | Ícone | 3,3:1 |
| 300 | `#A8DADC` | Fundo | |
| 100 | `#E0F7F4` | Fundo | |
| 50 | `#F7FFFD` | Fundo | |

### Verde · sucesso

Estados positivos: publicado, online, salvo, etapa concluída.

| Tom | Cor | Uso | Contraste |
|---|---|---|---|
| 900 | `#0F3D2E` | Texto | 12,2:1 |
| 700 | `#166534` | Texto | 7,1:1 |
| 500 | `#4C956C` | Ícone | 3,6:1 |
| 300 | `#A8D5BA` | Fundo | |
| 100 | `#E6F2EA` | Fundo | |
| 50 | `#F9FCF8` | Fundo | |

### Rosa e pêssego · atenção

Erros e ações destrutivas (rosa forte); pendências e rascunhos (pêssego).

| Tom | Cor | Uso | Contraste |
|---|---|---|---|
| 600 | `#E11D48` | Texto, erro, ação destrutiva, botão sólido rosa | 4,7:1 |
| pink 400 | `#F472B6` | Fundo (gráficos) | |
| 400 | `#FB7185` | Fundo (gráficos) | |
| pêssego | `#FDBA74` | Fundo (pendente: rascunho, POP sem código) | |
| 100 | `#FDE1E7` | Fundo | |
| 50 | `#FFF7F9` | Fundo | |

## Neutros (os 80%)

A base de todas as telas; as famílias acima não substituem os neutros.

| Papel | Cor |
|---|---|
| Texto principal | `#0E1525` |
| Texto secundário | `#5A6372` |
| Ícones e rótulos | `#6B7280` |
| Bordas | `#E6E8EC` |
| Fundo da página | `#F6F7F9` |
| Superfície (cartões) | `#FFFFFF` |

## Onde cada cor entra na plataforma

- **Índigo, ação e navegação:** botão primário ("Editar fluxograma"), item ativo do menu (fundo 100, texto 700),
  aba ativa (sublinhado), switch ligado, anel de foco (`#A5B4FC`), links, seleção, barra de progresso. Ao passar o
  mouse, o botão primário escurece para `#1E1B4B`.
- **Teal, Maia e IA:** "Melhorar com IA" (botão claro, fundo 100 e texto 700), "Convidar para entrevista" (botão
  sólido 700), o selo "Gerado pela Maia" e a sugestão da Maia em destaque suave (fundo 50 com borda 300).
  O usuário aprende: teal = IA.
- **Verde, concluído e no ar:** os selos "Publicado" e "Online", "Etapa concluída" com o check, "Salvo
  automaticamente". Só para estado positivo; nunca em botões de ação.
- **Rosa e pêssego, atenção:** o selo "Rascunho" e "Sem código · pendente" (pêssego), a mensagem de erro de campo
  ("Confira o e-mail: ele precisa ter '@'.", rosa 600) e "Remover" (borda e texto rosa, que aparece ao passar o
  mouse). `#F472B6` e `#FB7185` ficam para gráficos.

## Identidade: avatares e áreas

Fundo claro e texto escuro da mesma família, em rodízio, sempre com contraste de 4,5:1 ou mais: `#E0E7FF`
(índigo), `#E0F7F4` (teal), `#E6F2EA` (verde), `#FDE1E7` (rosa), `#FDBA74` (pêssego).

## Gráficos e indicadores

Ordem fixa das séries, sempre com rótulo (a cor nunca é a única pista): 1 `#4338CA`, 2 `#2A9D8F`, 3 `#4C956C`,
4 `#FB7185`, 5 `#FDBA74`, 6 `#A5B4FC`.

## Regras de uso

1. Um único botão índigo sólido por área da tela. As demais ações são secundárias (borda) ou terciárias (texto).
2. Teal só para a Maia e a IA. Se não foi a IA que fez ou vai fazer, não é teal.
3. Verde, rosa e pêssego só comunicam estado. Nunca como decoração ou cor de seção.
4. Tons 500 e mais claros nunca como texto pequeno sobre o branco. Texto usa sempre 700 ou mais escuro.
5. Selos de estado: fundo 100, texto 700 e ponto 500. Sempre com palavra, não só cor.
6. Botão sólido teal ou rosa só com texto branco, nos tons 700/600 (`#187C81` e `#E11D48`).

## O que fica de fora

- **O fluxograma** continua com as cores da "Biblioteca de Processos" do Rafael (decisão 62): é o padrão visual
  dos diagramas, não da interface.
- **A fonte** continua a Plus Jakarta Sans, com Light (300) nas descrições (decisão 71).
