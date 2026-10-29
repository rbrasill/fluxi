import { z } from 'zod';

// Marcações desenhadas sobre o print de uma tela. Coordenadas em pixels da imagem ORIGINAL,
// para reabrir e editar depois; a versão final (desenhada e recortada) é salva como outro PNG.

export const COR_PADRAO = '#E5252A';
export const CORES = [COR_PADRAO, '#F5B800', '#16A34A', '#2563EB', '#111827'] as const;

const num = z.number().finite();
const cor = z.string().regex(/^#[0-9a-fA-F]{6}$/);

export const FormaSchema = z.discriminatedUnion('tipo', [
  z.object({ id: z.string().max(40), tipo: z.literal('caixa'), x: num, y: num, w: num, h: num, cor }),
  z.object({ id: z.string().max(40), tipo: z.literal('seta'), x1: num, y1: num, x2: num, y2: num, cor }),
  z.object({ id: z.string().max(40), tipo: z.literal('numero'), x: num, y: num, n: z.number().int().min(1).max(99), cor }),
  z.object({ id: z.string().max(40), tipo: z.literal('texto'), x: num, y: num, texto: z.string().max(200), cor }),
  // Área quadriculada por cima de dados sensíveis (nomes, CPF, e-mails…): sai assim na imagem do POP.
  z.object({ id: z.string().max(40), tipo: z.literal('borrar'), x: num, y: num, w: num, h: num }),
]);

export const RecorteSchema = z.object({ x: num, y: num, w: num.positive(), h: num.positive() });

export const AnotacoesSchema = z.object({
  versao: z.literal(1),
  formas: z.array(FormaSchema).max(200),
  recorte: RecorteSchema.nullable(),
});

export type Forma = z.infer<typeof FormaSchema>;
export type Recorte = z.infer<typeof RecorteSchema>;
export type Anotacoes = z.infer<typeof AnotacoesSchema>;

export const anotacoesVazias = (): Anotacoes => ({ versao: 1, formas: [], recorte: null });
export const temAnotacao = (a: Anotacoes | null | undefined) => !!a && (a.formas.length > 0 || !!a.recorte);

/** Lado do quadrado do borrão, proporcional à imagem (20 px num print 1920 px): maior que uma letra. */
export const tamanhoBloco = (larguraImagem: number) => Math.max(8, Math.round(larguraImagem / 96));

/** Espessura do traço proporcional à imagem (≈5 px num print 1920 px). */
export const espessura = (larguraImagem: number) => Math.max(3, Math.round(larguraImagem / 380));
