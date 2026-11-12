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

## Implementação (MVP)
- **Só PDF (decisão 79):** o POP sai apenas em PDF; a geração em DOCX foi retirada da plataforma (botões, rotas, gerador, o template com marcadores e o script que o gerava). O `Modelo_POP_v3.docx` original fica como referência do layout.
- **PDF:** `lib/pop/pdf.ts` (pdfmake, JavaScript puro, roda na Vercel sem binário externo) reproduz o modelo, parágrafo por parágrafo: espaçadores, entrelinhas, margens, alturas de célula e posições das âncoras do modelo, com as regras de linha do Word (decisão 24). Os dados, as cores, o cabeçalho e a sequência de passos ficam em `lib/pop/documento.ts`. Fonte Roboto (`templates/pop/fontes/`) no lugar da Aptos; logo, ícones e decoração em `templates/pop/imagens/` (já extraídos do modelo, com os efeitos de cor aplicados); print e caixa do passo sempre juntos na mesma página.
- **Procedimentos:** os passos são numerados do início ao fim do POP ("Passo 1:", "Passo 2:"…), com o print (se houver) e o texto numa caixa de destaque logo abaixo (fundo creme #FFF4E0, barra laranja #F28C28 à esquerda, mesma largura do print). Passo sem print mostra só a caixa; passo sem texto, só o print. O nome do grupo de passos (quando preenchido) aparece como subtítulo.
- **Elaborado por:** campo `pops.autor` (migração `0010_pop_autor.sql`), preenchido pela pessoa enquanto não há login; depois virá do usuário logado. As linhas do histórico sem nome usam esse valor.
- **Dados:** tabela `pops` (migração `0003_pops.sql`): código do processo (o mesmo do fluxograma, se vinculado), identificação, versão, autor, `conteudo` (área, executor, objetivo, envolvidos, procedimentos com passos) e `historico`.
- **Criar a partir de uma gravação:** as telas marcadas com "Incluir no POP" viram os passos de um procedimento "Passo a passo no sistema", com a instrução digitada (ou a sugerida pela IA, quando houver).

## Notas técnicas

- Layout construído com tabelas; blocos repetíveis viram linhas com loop.
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
