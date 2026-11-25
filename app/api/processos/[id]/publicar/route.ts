import { z } from 'zod';
import { MAX_O_QUE_MUDOU } from '@/lib/versao';
import { responder } from '@/lib/server/http';
import { publicarProcesso } from '@/lib/server/publicacao';
import { pessoaLogada } from '@/lib/server/sessao';

export const dynamic = 'force-dynamic';
// A primeira publicação não precisa de nada; as seguintes pedem o tamanho da alteração e o que mudou (decisão 139).
// O tamanho mínimo do texto é conferido no servidor, com a mensagem certa.
const Pedido = z.object({ tipo: z.enum(['correcao', 'ajuste', 'mudanca']).optional(), o_que_mudou: z.string().max(MAX_O_QUE_MUDOU * 2).optional() });

/** Publica o processo como uma versão nova (decisões 129 e 139): a página pública passa a mostrar esta versão. */
export const POST = (req: Request, { params }: { params: Promise<{ id: string }> }) =>
  responder(async () => {
    const pedido = Pedido.parse(await req.json().catch(() => ({})));
    const pessoa = await pessoaLogada();
    return publicarProcesso((await params).id, pedido, pessoa ? { id: pessoa.id, nome: pessoa.nome } : null);
  });
