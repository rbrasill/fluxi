import { responderPublico } from '@/lib/server/http';
import { solicitarCodigo } from '@/lib/server/login';
import { ipDoPedido } from '@/lib/server/ip';

/** Passo 1 do login: manda o código por e-mail (a resposta é a mesma para e-mail cadastrado ou não). */
export const POST = async (req: Request) => {
  const corpo = await req.json().catch(() => ({}));
  return responderPublico(() => solicitarCodigo((corpo as { email?: unknown }).email, ipDoPedido(req)), { semCache: true });
};
