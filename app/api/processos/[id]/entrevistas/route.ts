import { origemDoApp } from '@/lib/server/carteiro';
import { ConviteSchema, convidar, listarDoProcesso } from '@/lib/server/entrevistas';
import { responder } from '@/lib/server/http';
import { exigirGestor } from '@/lib/server/sessao';

type Ctx = { params: Promise<{ id: string }> };
export const dynamic = 'force-dynamic';

/** As entrevistas com a Maia deste processo (decisão 53). */
export const GET = (_: Request, { params }: Ctx) => responder(async () => listarDoProcesso((await params).id));

/** Convida até três pessoas para entrevistas sobre este processo (uma por pessoa): gestores e administradores. */
export const POST = (req: Request, { params }: Ctx) =>
  responder(async () => {
    const quem = await exigirGestor();
    return convidar((await params).id, ConviteSchema.parse(await req.json()), quem, origemDoApp(req));
  });
