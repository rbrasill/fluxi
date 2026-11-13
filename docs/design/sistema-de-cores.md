# Sistema de cores do INCFlow (redesign, decisão 75)

Definido pelo Rafael em 12/11/2026, junto com o redesign de toda a plataforma. A referência original está em
`docs/design/referencias/sistema-de-cores.webp`. As variáveis estão em `app/globals.css` (`--indigo-700` e
outras); elas vão sendo aplicadas tela a tela, à medida que o redesign avança.

A ideia: quatro famílias, cada uma com um papel fixo, para a cor sempre significar a mesma coisa. **Índigo é ação,
rosa é a Maia, verde é concluído, vermelho e pêssego pedem atenção.**

Atualizado em 13/11/2026 (decisões 96 e 97): a Maia trocou o teal pelo **rosa**, escolhido pelo Rafael por ser mais
feminino e humano, a partir do `#F472B6`. Com isso, o que era rosa de perigo (erro, excluir, gravação) passou a um
**vermelho de verdade**, e o ícone de ajuda passou a cinza, para nada ser confundido com a Maia. As outras IAs
("Melhorar com IA", "Gerar com IA") continuam em **teal**: o rosa é só da Maia.

## Proporção em cada tela

A interface é quase toda neutra: **neutros 80%**, **índigo 12%**, e o resto em pequenas doses de rosa (a Maia),
verde e vermelho, que só aparecem quando têm algo a dizer (IA, estado concluído, alerta).

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

### Rosa · Maia (decisão 96)

Tudo o que a Maia faz ou sugere: entrevistas e convites, a ligação, o resultado das conversas, as regras sugeridas,
Conversas com a Maia e o Painel da Maia. As outras IAs ("Melhorar com IA", "Gerar com IA") ficam em teal (abaixo). A escala sai do `#F472B6` (tom 400): o rosa escolhido
aparece na esfera, nos ícones, no play e nas bordas; o botão usa o 600, um tom mais fechado, para o texto branco
ser legível.

| Tom | Cor | Uso | Contraste |
|---|---|---|---|
| 900 | `#831843` | Texto | 9,7:1 |
| 800 | `#9D174D` | Texto (selos, textos sobre o fundo 100) | 7,9:1 |
| 700 | `#BE185D` | Texto, o botão ao passar o mouse | 6,0:1 |
| 600 | `#DB2777` | Botão sólido da Maia (texto branco), ícones | 4,6:1 |
| 500 | `#EC4899` | Ícone | 3,5:1 |
| 400 | `#F472B6` | A cor da Maia: esfera, play, detalhes | |
| 300 | `#F9A8D4` | Fundo | |
| 200 | `#FBCFE8` | Fundo, bordas | |
| 100 | `#FCE7F3` | Fundo (botão claro, selos) | |
| 50 | `#FDF2F8` | Fundo | |

### Teal · as outras IAs (decisão 97)

O que a IA faz sem ser a Maia: "Melhorar com IA", "Gerar com IA" e "Gerar de novo com IA" (fluxograma), a sugestão
de texto. Botão claro: fundo 100 e texto 700.

| Tom | Cor | Uso | Contraste |
|---|---|---|---|
| 900 | `#0F4C5C` | Texto | 9,5:1 |
| 700 | `#187C81` | Texto | 5,0:1 |
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

### Vermelho e pêssego · atenção

Erros, ações destrutivas e gravação de tela (vermelho); pendências e rascunhos (pêssego). Até a decisão 96, este
papel era de um rosa avermelhado (`#E11D48`); com a Maia em rosa, passou a vermelho.

| Tom | Cor | Uso | Contraste |
|---|---|---|---|
| 800 | `#991B1B` | Texto sobre o fundo 100 | 8,3:1 |
| 700 | `#B91C1C` | Texto, botão destrutivo ao passar o mouse | 6,5:1 |
| 600 | `#DC2626` | Texto, erro, ação destrutiva, botão sólido vermelho, gravando | 4,8:1 |
| 400 | `#F87171` | Ícone | |
| pêssego | `#FDBA74` | Fundo (pendente: rascunho, POP sem código, ficou em aberto, possível conflito) | |
| 100 | `#FEE2E2` | Fundo | |
| 50 | `#FEF2F2` | Fundo | |

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
- **Rosa, a Maia:** "Convidar para entrevista" (botão sólido 600), "Perguntar na próxima entrevista" (botão claro), o selo "Gerado pela Maia", a sugestão da Maia em destaque suave (fundo 50 com borda 200), a esfera
  e os estados da ligação ("Maia está ouvindo" em fundo 100; "Maia está falando" em 600 sólido). O usuário
  aprende: rosa = Maia.
- **Teal, as outras IAs:** "Melhorar com IA" e "Gerar com IA" (botão claro, fundo 100 e texto 700) e a sugestão de
  texto em destaque suave (fundo 50 com borda 300).
- **Verde, concluído e no ar:** os selos "Publicado" e "Online", "Etapa concluída" com o check, "Salvo
  automaticamente". Só para estado positivo; nunca em botões de ação.
- **Vermelho e pêssego, atenção:** o selo "Rascunho" e "Sem código · pendente" (pêssego), a mensagem de erro de
  campo (vermelho 600), "Remover" e "Excluir" (vermelho, que aparece ao passar o mouse), "Offline" e o ponto de
  gravando.
- **Cinza, ajuda:** o ícone de informação que explica os tipos de regra.

## Identidade: avatares e áreas

Fundo claro e texto escuro da mesma família, em rodízio, sempre com contraste de 4,5:1 ou mais: `#E0E7FF`
(índigo), `#E0F7F4` (teal), `#E6F2EA` (verde), `#FDE1E7` (rosa), `#FDBA74` (pêssego). Aqui o teal e o rosa são só
cores de identidade (de pessoas e áreas), não a Maia.

## Gráficos e indicadores

Ordem fixa das séries, sempre com rótulo (a cor nunca é a única pista): 1 `#4338CA`, 2 `#F472B6`, 3 `#4C956C`,
4 `#F87171`, 5 `#FDBA74`, 6 `#A5B4FC`.

## Regras de uso

1. Um único botão índigo sólido por área da tela. As demais ações são secundárias (borda) ou terciárias (texto).
2. Rosa só para a Maia; teal para as outras IAs. Se não foi a IA que fez ou vai fazer, não é rosa nem teal.
3. Verde, vermelho e pêssego só comunicam estado. Nunca como decoração ou cor de seção.
4. Tons 500 e mais claros nunca como texto pequeno sobre o branco. Texto usa sempre 700 ou mais escuro.
5. Selos de estado: fundo 100, texto 700 e ponto 500. Sempre com palavra, não só cor.
6. Botão sólido rosa ou vermelho só com texto branco, no tom 600 (`#DB2777` e `#DC2626`).

## O que fica de fora

- **O fluxograma** continua com as cores da "Biblioteca de Processos" do Rafael (decisão 62): é o padrão visual
  dos diagramas, não da interface.
- **A fonte** continua a Plus Jakarta Sans, com Light (300) nas descrições (decisão 71).
