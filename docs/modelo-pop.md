# Fluxi — Documento do POP

O documento padrão de Procedimento Operacional Padrão da plataforma: a página pública do POP e o PDF, no mesmo desenho (decisão 140).

- O desenho veio de um exemplo em HTML enviado pelo Rafael em 25/11/2026 e está em `components/publico/DocumentoDoPop.tsx` (página, com os estilos `.docpop` em `app/globals.css`) e em `lib/pop/pdf.ts` (PDF).
- Desenho anterior: [`templates/pop/Modelo_POP_v3.docx`](../templates/pop/Modelo_POP_v3.docx), de 27/10/2026, que o PDF reproduzia até a decisão 140. Fica só como registro.

## Estrutura

| Seção | Campos | Origem |
|---|---|---|
| Cabeçalho | Logo sobre o padrão, "POP - Procedimento Operacional Padrão", área (título) | Tenant / sistema (a área é a do processo, decisão 137) |
| Procedimento | Nome, mês/ano, versão | Usuário (nome) / sistema |
| Identificação | Data de criação, código do procedimento (ex.: `A7K2-9QXM`), identificação do POP (ex.: `COME-001`) | Sistema / usuário (identificação) |
| Executor do processo | Cargo do executor | Usuário |
| Objetivo do processo | Texto (a seção não aparece se estiver vazio) | Usuário |
| Envolvidos | Pares área ↔ cargo (a seção não aparece se não houver nenhum) | Usuário |
| Recursos do processo | Fluxograma + "Abrir diagrama" (na página, também a imagem do fluxograma) | Sistema |
| Procedimentos | Uma faixa escura por etapa ("Etapa N" e o nome). Os passos são numerados do início ao fim do POP: o número num selo, o print (se houver) e o texto logo abaixo, no mesmo cartão | Usuário |
| Histórico de revisões | Data, elaborado por (quem publicou a versão), revisão (versão X.Y.Z, tamanho da alteração e o que mudou) | Sistema (decisão 138) |
| Rodapé | Identificação e código; organização (no PDF, também "Página X de Y", em todas as páginas) | Sistema |

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
- **Só PDF (decisão 79):** o POP sai apenas em PDF; a geração em DOCX foi retirada da plataforma (botões, rotas, gerador, o template com marcadores e o script que o gerava).
- **PDF (decisão 140):** `lib/pop/pdf.ts` (pdfmake, JavaScript puro, roda na Vercel sem binário externo) desenha o documento no mesmo visual da página pública. Os dados, o cabeçalho, as etapas com os passos numerados e o tamanho dos prints ficam em `lib/pop/documento.ts`, que a página também usa. Fonte Roboto (`templates/pop/fontes/`); logo e padrão do cabeçalho em `templates/pop/imagens/` (a página usa as cópias em `public/pop/`); os ícones são desenhados no código.
  - O pdfmake só sabe a altura de um bloco depois de montá-lo. O que tem altura fixa (faixa da seção, selo, pílula) é um retângulo arredondado; a faixa da etapa é uma tabela com uma "tampa" arredondada em cima e embaixo; o cartão do passo é uma tabela com os cantos arredondados desenhados por cima.
  - O passo não se parte entre páginas, e a faixa da etapa fica com o primeiro passo dela. O passo de texto muito longo (pela altura estimada) é a exceção: o selo e o print ficam juntos e o texto continua na página seguinte.
  - Rodapé em todas as páginas: identificação e código; organização e "Página X de Y".
- **Procedimentos:** uma faixa escura por etapa. Os passos são numerados do início ao fim do POP, com o número num selo laranja; o print (se houver) ocupa a largura do cartão e o texto vem logo abaixo, numa caixa creme (#FFF4E0) com barra laranja (#FF6400) à esquerda. Passo sem print mostra só o texto; passo sem texto, só o print; passo sem nenhum dos dois não aparece, nem a etapa sem passos. No PDF o print não é cortado: o que é mais alto fica menor e centralizado.
- **Elaborado por:** campo `pops.autor` (migração `0010_pop_autor.sql`), preenchido sozinho com o nome de quem está logado e cria (ou copia) o POP; não se edita (decisão 137). As linhas do histórico sem nome usam esse valor.
- **Área:** a do cabeçalho do documento é sempre o nome atual da área do processo do POP; não se edita (decisão 137).
- **Versão e histórico (decisão 138):** a versão é X.Y.Z e vem da publicação (`lib/pop/versao.ts`): a primeira é 1.0.0; nas seguintes, quem publica escolhe correção (Z), ajuste (Y) ou mudança no procedimento (X) e escreve o que mudou (10 a 300 caracteres). Cada versão fica em `pop_versoes`, com a cópia do documento e dos prints. A tabela "Histórico de revisões" tem uma linha por versão. O PDF baixado do editor sai como "Rascunho" quando o POP nunca foi publicado ou tem alterações não publicadas.
- **Dados:** tabela `pops` (migração `0003_pops.sql`): código do processo (o mesmo do fluxograma, se vinculado), identificação, versão, autor, `conteudo` (área, executor, objetivo, envolvidos, procedimentos com passos) e `historico`.
- **Criar a partir de uma gravação:** as telas marcadas com "Incluir no POP" viram os passos de um procedimento "Passo a passo no sistema", com a instrução digitada (ou a sugerida pela IA, quando houver).

## Regras de identificação

- **Código do processo:** 8 caracteres alfanuméricos em dois blocos de 4, separados por `-` (formato `XXXX-XXXX`, ex.: `A7K2-9QXM`) — confirmado.
  - Gerado pelo sistema, único dentro do tenant e imutável (não muda entre versões).
  - Proposta: letras maiúsculas e números, excluindo caracteres ambíguos (`0/O`, `1/I/L`).
- **Identificação do POP:** prefixo da área (4 letras) + sequencial de 3 dígitos por área no tenant (ex.: `COME-001`).
- **Envolvidos:** cada linha é um par área ↔ cargo.
- **Datas:** não há distinção entre "mês/ano" e "Data Criação"; o mês/ano exibido é derivado da data de criação.

## Personalização por tenant

- Cada tenant pode trocar apenas a **logo** e a **cor de destaque** (laranja no modelo padrão).
- Tenants não criam modelos próprios: o documento do POP é um só na plataforma.

## Futuro

- Campos opcionais extras no POP: sistemas utilizados, entradas/saídas, indicadores, riscos/pontos de atenção.
