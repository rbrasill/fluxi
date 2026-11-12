import { origemDoApp } from '@/lib/server/carteiro';
import { reenviarConvite } from '@/lib/server/entrevistas';
import { responder } from '@/lib/server/http';
import { exigirGestor } from '@/lib/server/sessao';

type Ctx = { params: Promise<{ id: string }> };

/** Manda o e-mail do convite de novo (convite pendente): gestores e administradores. */
export const POST = (req: Request, { params }: Ctx) =>
  responder(async () => reenviarConvite((await params).id, await exigirGestor(), origemDoApp(req)));
