import { responderPublico } from '@/lib/server/http';
import { validarCodigo } from '@/lib/server/login';
import { ipDoPedido } from '@/lib/server/ip';
import { gravarCookieDeSessao } from '@/lib/server/sessao';

/** Passo 2 do login: confere o código e abre a sessão (cookie HttpOnly de 6 horas). */
export const POST = async (req: Request) => {
  const corpo = (await req.json().catch(() => ({}))) as { email?: unknown; codigo?: unknown };
  return responderPublico(async () => {
    const { token } = await validarCodigo(corpo.email, corpo.codigo, ipDoPedido(req));
    await gravarCookieDeSessao(token);
    return { ok: true };
  }, { semCache: true });
};
