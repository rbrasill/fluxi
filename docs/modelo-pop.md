# Fluxi — Modelo de POP (v3)

Modelo padrão de Procedimento Operacional Padrão da plataforma.

- Original: [`templates/pop/Modelo_POP_v3.docx`](../templates/pop/Modelo_POP_v3.docx) (versão de 27/10/2026: título "POP - Procedimento Operacional Padrão", ícones nas seções, procedimentos como print + caixa "Passo N:", "Históricos de Revisões" com quem elaborou o POP)

## Estrutura

| Seção | Campos | Origem |
|---|---|---|
| Cabeçalho | Logo, faixa decorativa, título "POP - Procedimento Operacional Padrão", área | Tenant / usuário |
| Procedimento | Nome, mês/ano, versão | Usuário (nome) / sistema |
| Identificação | Data de criação, código do processo (ex.: `A7K2-9QXM`), identificação do POP (ex.: `COME-001`) | Sistema |
| Executor do Processo | Cargo do executor | IA sugere, usuário confirma |
| Objetivo do Processo | Texto | IA |
| Envolvidos | Pares área ↔ cargo | IA |
| Recursos do Processo | Fluxograma + link "Abrir diagrama" | Sistema |
| Procedimentos | Passos numerados do início ao fim: print da tela (se houver) e, logo abaixo, o texto numa caixa de destaque "Passo N:". O nome do grupo de passos vira um subtítulo | IA + usuário |
| Históricos de Revisões | Data, elaborado por (quem criou o POP), revisão | Sistema + usuário |

## Schema de extração (IA)

Campos de controle (código, identificação, versão, datas, histórico) são gerados pelo sistema, não pela IA.

```ts
const PopSchema = z.object({
  nomeProcedimento: z.string(),
  area: z.string(),
  executor: z.string(),
  objetivo: z.string(),
  envolvidos: z.array(z.object({
    area: z.string(),
    cargo: z.string(),
  })),
  procedimentos: z.array(z.object({
    nome: z.string(),
    passos: z.array(z.string()),
    responsavel: z.string().optional(),   // liga à raia do fluxograma
    trechoAudio: z.object({ inicio: z.number(), fim: z.number() }).optional(),
  })),
})
```

## Mapeamento para o template (docxtemplater)

| Onde | Marcador |
|---|---|
| Cabeçalho | `{area}`, logo `{%logo}` |
| Procedimento | `{nomeProcedimento}`, `{mesAno}` (derivado de `dataCriacao`), `Versão: {versao}` |
| Identificação | `{dataCriacao}`, `{codigoProcesso}`, `{identificacaoPop}` |
| Executor | `{executor}` |
| Objetivo | `{@objetivo}` (parágrafos e listas com formatação, ver decisão 29) |
| Envolvidos | `{#envolvidos}{area} · {cargo}{/envolvidos}` |
| Recursos | `{linkFluxograma}` |
| Procedimentos | `{#itens}{@bloco}{/itens}` (cada bloco é XML pronto: subtítulo, print ou caixa do passo) |
| Históricos de Revisões | `{#historico}{data} · {elaboradoPor} · {revisao}{/historico}` |

## Implementação (MVP)
- **Template:** `templates/pop/modelo-pop-v3.template.docx` é gerado a partir do original por `npm run modelo-pop` (`scripts/preparar-modelo-pop.mjs`), que troca os textos de exemplo pelos marcadores, tira o print e a caixa de amostra e exporta a logo, os ícones e a decoração para `templates/pop/imagens/` (usados no PDF). Não editar o template à mão: ajustar o script e gerar de novo. Quando chegar um modelo novo, basta trocar o `.docx` original e rodar o script.
- **DOCX:** `lib/pop/docx.ts` (docxtemplater, sem módulos pagos). Imagens das telas, caixas dos passos e o hiperlink "Abrir diagrama" são inseridos como XML próprio.
- **PDF:** `lib/pop/pdf.ts` (pdfmake, JavaScript puro, roda na Vercel sem binário externo) reproduz o modelo com os mesmos dados, parágrafo por parágrafo: espaçadores, entrelinhas, margens e alturas de célula e posições das âncoras iguais às do DOCX, com as regras de linha do Word (decisão 24). Fonte Roboto (`templates/pop/fontes/`) no lugar da Aptos; print e caixa do passo sempre juntos na mesma página. Não é uma conversão do DOCX: os dois são gerados do mesmo conteúdo (`DadosPop`), então mudança de layout no modelo pede ajuste nos dois geradores. Os efeitos de cor das imagens do modelo (ex.: duotone da faixa) são aplicados no PNG pelo `npm run modelo-pop`.
- **Procedimentos:** os passos são numerados do início ao fim do POP ("Passo 1:", "Passo 2:"…), com o print (se houver) e o texto numa caixa de destaque logo abaixo (fundo creme #FFF4E0, barra laranja #F28C28 à esquerda, mesma largura do print). Passo sem print mostra só a caixa; passo sem texto, só o print. O nome do grupo de passos (quando preenchido) aparece como subtítulo.
- **Elaborado por:** campo `pops.autor` (migração `0010_pop_autor.sql`), preenchido pela pessoa enquanto não há login; depois virá do usuário logado. As linhas do histórico sem nome usam esse valor.
- **Dados:** tabela `pops` (migração `0003_pops.sql`): código do processo (o mesmo do fluxograma, se vinculado), identificação, versão, autor, `conteudo` (área, executor, objetivo, envolvidos, procedimentos com passos) e `historico`.
- **Criar a partir de uma gravação:** as telas marcadas com "Incluir no POP" viram os passos de um procedimento "Passo a passo no sistema", com a instrução digitada (ou a sugerida pela IA, quando houver).

## Notas técnicas

- Layout construído com tabelas; blocos repetíveis viram linhas com loop.
- Texto do DOCX está fragmentado em vários trechos internos (revisão ortográfica/formatação). Ao criar a versão com marcadores, cada marcador precisa ficar em um trecho contínuo.
- 11 imagens no modelo (logo, faixa decorativa, ícones das seções e decoração). A logo será substituível por tenant.

## Regras de identificação

- **Código do processo:** 8 caracteres alfanuméricos em dois blocos de 4, separados por `-` (formato `XXXX-XXXX`, ex.: `A7K2-9QXM`) — confirmado.
  - Gerado pelo sistema, único dentro do tenant e imutável (não muda entre versões).
  - Proposta: letras maiúsculas e números, excluindo caracteres ambíguos (`0/O`, `1/I/L`).
- **Identificação do POP:** prefixo da área (4 letras) + sequencial de 3 dígitos por área no tenant (ex.: `COME-001`).
- **Envolvidos:** cada linha é um par área ↔ cargo; a numeração (1, 2… / A, B…) é gerada no documento.
- **Datas:** não há distinção entre "mês/ano" e "Data Criação"; o mês/ano exibido é derivado da data de criação.

## Personalização por tenant

- Cada tenant pode trocar apenas a **logo** e a **cor de destaque** (laranja no modelo padrão).
- Tenants não criam modelos próprios: o Modelo POP v3 é o único modelo da plataforma.

## Futuro

- Campos opcionais extras no POP: sistemas utilizados, entradas/saídas, indicadores, riscos/pontos de atenção.
