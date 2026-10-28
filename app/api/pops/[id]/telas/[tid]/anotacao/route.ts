import { z } from 'zod';
import { AnotacoesSchema } from '@/lib/marcacao/anotacoes';
import { responder } from '@/lib/server/http';
import { salvarAnotacaoTela } from '@/lib/server/pops';

type Ctx = { params: Promise<{ id: string; tid: string }> };
const Corpo = z.object({
  anotacoes: AnotacoesSchema,
  imagem_anotada_caminho: z.string().max(400),
  largura: z.number().int().positive().max(20000),
  altura: z.number().int().positive().max(20000),
});

export const dynamic = 'force-dynamic';
/** Salva as marcações desenhadas num print do POP (imagem final já enviada ao Storage). */
export const PUT = (req: Request, { params }: Ctx) =>
  responder(async () => {
    const { id, tid } = await params;
    return salvarAnotacaoTela(id, tid, Corpo.parse(await req.json()));
  });
/** Remove as marcações (volta ao print original). */
export const DELETE = (_: Request, { params }: Ctx) =>
  responder(async () => {
    const { id, tid } = await params;
    return salvarAnotacaoTela(id, tid, null);
  });
