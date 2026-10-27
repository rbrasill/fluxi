import { z } from 'zod';
import { AnotacoesSchema } from '@/lib/marcacao/anotacoes';
import { salvarAnotacao } from '@/lib/server/gravacoes';
import { responder } from '@/lib/server/http';

type Ctx = { params: Promise<{ id: string; mid: string }> };
const Corpo = z.object({
  anotacoes: AnotacoesSchema,
  imagem_anotada_caminho: z.string().max(400),
  largura: z.number().int().positive().max(20000),
  altura: z.number().int().positive().max(20000),
});

export const dynamic = 'force-dynamic';
/** Salva as marcações desenhadas e a imagem final já enviada ao Storage. */
export const PUT = (req: Request, { params }: Ctx) =>
  responder(async () => {
    const { id, mid } = await params;
    return salvarAnotacao(id, mid, Corpo.parse(await req.json()));
  });
/** Remove as marcações (volta ao print original). */
export const DELETE = (_: Request, { params }: Ctx) =>
  responder(async () => {
    const { id, mid } = await params;
    return salvarAnotacao(id, mid, null);
  });
