import { responder } from '@/lib/server/http';
import { publicar } from '@/lib/server/publicacao';

export const dynamic = 'force-dynamic';
/** Publica o POP como está agora: a página pública passa a mostrar esta versão. */
export const POST = (_: Request, { params }: { params: Promise<{ id: string }> }) =>
  responder(async () => {
    const { publicado_em, link_publico } = await publicar((await params).id);
    return { publicado_em, link_publico };
  });
