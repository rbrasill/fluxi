import { responderPublico } from '@/lib/server/http';
import { pessoaDaSessao, revogarSessoes } from '@/lib/server/login';
import { apagarCookieDeSessao, tokenDoCookie } from '@/lib/server/sessao';

/** Sai: apaga o cookie e revoga a sessão (o token copiado também para de valer). */
export const POST = () =>
  responderPublico(async () => {
    const p = await pessoaDaSessao(await tokenDoCookie());
    if (p) await revogarSessoes(p);
    await apagarCookieDeSessao();
    return { ok: true };
  }, { semCache: true });
