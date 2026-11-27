import { z } from 'zod';
import { MAX_AVISAR, MAX_DESCRICAO, MAX_NOME } from '@/lib/anexos';
import { criar } from '@/lib/server/anexos';
import { responder } from '@/lib/server/http';
import { pessoaLogada } from '@/lib/server/sessao';

export const dynamic = 'force-dynamic';
const Novo = z.object({
  caminho: z.string().min(1).max(400),
  nome: z.string().min(1).max(MAX_NOME * 2),
  tipo: z.string().max(200).default(''),
  tamanho: z.number().int().nonnegative(),
  descricao: z.string().max(MAX_DESCRICAO * 2),
  validade: z.string().max(10).nullable(),
  avisar_dias: z.number().int().min(0).max(MAX_AVISAR),
});

/** Registra no POP o arquivo que o navegador acabou de enviar ao Storage (decisão 141). */
export const POST = (req: Request, { params }: { params: Promise<{ id: string }> }) =>
  responder(async () => {
    const dados = Novo.parse(await req.json());
    const pessoa = await pessoaLogada();
    return criar((await params).id, dados, pessoa ? { id: pessoa.id, nome: pessoa.nome } : null);
  });
