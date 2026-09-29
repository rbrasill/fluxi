import { z } from 'zod';

// Conteúdo do POP (Modelo POP v3, ver docs/modelo-pop.md). Controle (código,
// identificação, versão, datas, histórico) vem do sistema; o resto a IA sugere
// e a pessoa revisa.
export const PassoSchema = z.object({
  texto: z.string(),
  // Tela marcada na gravação (opcional).
  imagem_caminho: z.string().optional(),
  imagem_largura: z.number().optional(),
  imagem_altura: z.number().optional(),
  marcacao_id: z.string().optional(),
});

export const ProcedimentoSchema = z.object({
  nome: z.string(),
  passos: z.array(PassoSchema),
});

export const HistoricoSchema = z.object({ data: z.string(), elaborado_por: z.string(), revisao: z.string() });

export const ConteudoPopSchema = z.object({
  area: z.string(),
  executor: z.string(),
  objetivo: z.string(),
  envolvidos: z.array(z.object({ area: z.string(), cargo: z.string() })),
  procedimentos: z.array(ProcedimentoSchema),
});

export type Passo = z.infer<typeof PassoSchema>;
export type Procedimento = z.infer<typeof ProcedimentoSchema>;
export type Historico = z.infer<typeof HistoricoSchema>;
export type ConteudoPop = z.infer<typeof ConteudoPopSchema>;

export const conteudoVazio = (): ConteudoPop => ({
  area: '',
  executor: '',
  objetivo: '',
  envolvidos: [],
  procedimentos: [{ nome: '', passos: [{ texto: '' }] }],
});
