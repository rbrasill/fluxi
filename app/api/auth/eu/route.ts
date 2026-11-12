import { responderPublico } from '@/lib/server/http';
import { segredo } from '@/lib/server/login';
import { pessoaLogada } from '@/lib/server/sessao';

/** Quem está logado (nome e nível lidos do cadastro a cada chamada, não do token). */
export const GET = () =>
  responderPublico(async () => {
    if (!segredo() && process.env.NODE_ENV !== 'production') return { enabled: false };
    const p = await pessoaLogada();
    return { enabled: true, email: p!.email, personId: p!.id, name: p!.nome, nivel: p!.nivel };
  }, { semCache: true });
