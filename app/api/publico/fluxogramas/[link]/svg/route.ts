import { NextResponse } from 'next/server';
import { ErroApi } from '@/lib/server/http';
import { svgPublico } from '@/lib/server/publicacao';

export const dynamic = 'force-dynamic';

/**
 * O SVG do fluxograma, como imagem. A política de segurança deixa passar só estilos (a animação
 * das setas é CSS) e imagens embutidas: mesmo aberto direto no navegador, nenhum script roda.
 */
export async function GET(_: Request, { params }: { params: Promise<{ link: string }> }) {
  try {
    const svg = await svgPublico((await params).link);
    return new NextResponse(svg, {
      headers: {
        'content-type': 'image/svg+xml; charset=utf-8',
        'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:",
        'x-content-type-options': 'nosniff',
        'cache-control': 'public, max-age=60',
      },
    });
  } catch (e) {
    const status = e instanceof ErroApi ? e.status : 500;
    if (status >= 500) console.error(e);
    return new NextResponse(null, { status });
  }
}
