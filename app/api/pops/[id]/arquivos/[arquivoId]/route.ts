import { z } from 'zod';
import { MAX_AVISAR, MAX_DESCRICAO } from '@/lib/anexos';
import { abrir, atualizar, excluir } from '@/lib/server/anexos';
import { responder } from '@/lib/server/http';

export const dynamic = 'force-dynamic';
type Params = { params: Promise<{ id: string; arquivoId: string }> };
const Dados = z.object({ descricao: z.string().max(MAX_DESCRICAO * 2), validade: z.string().max(10).nullable(), avisar_dias: z.number().int().min(0).max(MAX_AVISAR) });

/** Os endereços (temporários) para abrir o arquivo agora. O arquivo expirado não abre (decisão 141). */
export const GET = (_req: Request, { params }: Params) =>
  responder(async () => { const p = await params; return abrir(p.id, p.arquivoId); });

/** Muda a descrição e a validade do arquivo. */
export const PATCH = (req: Request, { params }: Params) =>
  responder(async () => { const p = await params; return atualizar(p.id, p.arquivoId, Dados.parse(await req.json())); });

/** Exclui o arquivo: sai do POP, das etapas e da página pública na hora. */
export const DELETE = (_req: Request, { params }: Params) =>
  responder(async () => { const p = await params; return excluir(p.id, p.arquivoId); });
