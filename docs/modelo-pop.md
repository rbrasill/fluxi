# Fluxi — Modelo de POP (v3)

Modelo padrão de Procedimento Operacional Padrão da plataforma.

- Original: [`templates/pop/Modelo_POP_v3.docx`](../templates/pop/Modelo_POP_v3.docx)
- Referência visual: [`templates/pop/Modelo_POP_v3.pdf`](../templates/pop/Modelo_POP_v3.pdf)

## Estrutura

| Seção | Campos | Origem |
|---|---|---|
| Cabeçalho | Logo, área | Tenant / usuário |
| Procedimento | Nome, mês/ano, versão | Usuário (nome) / sistema |
| Identificação | Data de criação, código do processo (ex.: `A7K2-9QXM`), identificação do POP (ex.: `COME-001`) | Sistema |
| Executor do Processo | Cargo do executor | IA sugere, usuário confirma |
| Objetivo do Processo | Texto | IA |
| Envolvidos | Pares área ↔ cargo | IA |
| Recursos do Processo | Fluxograma + link "Abrir diagrama" | Sistema |
| Procedimentos | Nome + descrição em tópicos (repetível) | IA |
| Históricos | Data, elaborado por, revisão | Sistema (versionamento) |

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
| Objetivo | `{objetivo}` |
| Envolvidos | `{#envolvidos}{area} · {cargo}{/envolvidos}` |
| Recursos | `{linkFluxograma}` |
| Procedimentos | `{#procedimentos}{nome}` + `{#passos}• {.}{/passos}{/procedimentos}` |
| Históricos | `{#historico}{data} · {elaboradoPor} · {revisao}{/historico}` |

## Notas técnicas

- Layout construído com tabelas (15 no documento); blocos repetíveis viram linhas com loop.
- Texto do DOCX está fragmentado em vários trechos internos (revisão ortográfica/formatação). Ao criar a versão com marcadores, cada marcador precisa ficar em um trecho contínuo.
- 5 imagens (logo e ícones). A logo será substituível por tenant.

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
