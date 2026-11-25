import { NextResponse } from 'next/server';
import { ErroApi } from '@/lib/server/http';
import { imagensDe } from '@/lib/server/fluxogramas';

export const dynamic = 'force-dynamic';

/**
 * A prévia do fluxograma na página do processo (decisão 124): o SVG publicado pelo editor, como imagem, para quem está
 * logado (o porteiro barra o resto), também em processo arquivado. A mesma política de segurança da rota pública: só
 * estilos e imagens embutidas, nenhum script roda.
 */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new ErroApi(404, 'Fluxograma não encontrado');
    const { svg } = await imagensDe(id);
    if (!svg) throw new ErroApi(404, 'Fluxograma sem imagem');
    return new NextResponse(svg, {
      headers: {
        'content-type': 'image/svg+xml; charset=utf-8',
        'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:",
        'x-content-type-options': 'nosniff',
        'cache-control': 'private, max-age=30',
      },
    });
  } catch (e) {
    const status = e instanceof ErroApi ? e.status : 500;
    if (status >= 500) console.error(e);
    return new NextResponse(null, { status });
  }
}
