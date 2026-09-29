import { z } from 'zod';

// Estrutura semântica do fluxograma que a IA devolve (ver docs/fluxograma.md).
// O código converte para o XML do draw.io com a biblioteca BPMN INC.
export const TIPOS_NO = [
  'inicio',
  'inicio_mensagem',
  'inicio_condicional',
  'fim',
  'link_entrada',
  'link_saida',
  'tarefa',
  'gateway_exclusivo',
  'gateway_paralelo',
  'gateway_inclusivo',
  'gateway_evento',
] as const;

export const FluxoSchema = z.object({
  titulo: z.string().describe('Nome curto do processo'),
  raias: z
    .array(z.object({ id: z.string(), area: z.string().describe('Área ou papel responsável, ex.: Comercial') }))
    .describe('Uma raia por área envolvida, na ordem em que aparecem no processo'),
  nos: z.array(
    z.object({
      id: z.string(),
      tipo: z.enum(TIPOS_NO),
      raia: z.string().describe('id da raia'),
      texto: z.string().describe('Tarefas: verbo no infinitivo + objeto, até 8 palavras. Gateways: pergunta curta terminada em "?"'),
    }),
  ),
  conexoes: z.array(
    z.object({
      de: z.string(),
      para: z.string(),
      rotulo: z.string().optional().describe('Nas saídas de gateway exclusivo: "Sim" ou "Não" (ou a condição)'),
    }),
  ),
  anotacoes: z
    .array(
      z.object({
        no: z.string().describe('id do nó a que a anotação se refere'),
        tipo: z.enum(['nota', 'alerta']),
        texto: z.string(),
      }),
    )
    .optional(),
});

export type Fluxo = z.infer<typeof FluxoSchema>;
export type TipoNo = (typeof TIPOS_NO)[number];
