# Fluxi — Modelo de POP (v3)

Modelo padrão de Procedimento Operacional Padrão da plataforma.

- Original: [`templates/pop/Modelo_POP_v3.docx`](../templates/pop/Modelo_POP_v3.docx)
- Referência visual: [`templates/pop/Modelo_POP_v3.pdf`](../templates/pop/Modelo_POP_v3.pdf)

## Estrutura

| Seção | Campos | Origem |
|---|---|---|
| Cabeçalho | Logo, área | Tenant / usuário |
| Procedimento | Nome, mês/ano, versão | Usuário (nome) / sistema |
| Identificação | Data de criação, código do procedimento (ex.: `CONT-PERM`), identificação do POP (ex.: `COME-001`) | Sistema |
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
| Procedimento | `{nomeProcedimento}`, `{mesAno}`, `Versão: {versao}` |
| Identificação | `{dataCriacao}`, `{codigoProcedimento}`, `{identificacaoPop}` |
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
- Personalização por tenant (proposta): logo e cor de destaque (laranja atual).

## Em aberto

1. Regra de geração do código do procedimento e da identificação do POP (prefixo da área + sequencial?).
2. Envolvidos: área e cargo são pares na mesma linha ou listas independentes?
3. "Mês/ano" é a data da versão vigente e "Data Criação" a data original?
4. Campos opcionais extras (sistemas, entradas/saídas, indicadores, riscos)?
5. Tenants poderão criar modelos próprios ou só personalizar logo/cor?
