import { NextResponse } from 'next/server';
import { ErroApi } from '@/lib/server/http';
import { svgDaVersaoDoProcesso } from '@/lib/server/publicacao';
import { pessoaLogada } from '@/lib/server/sessao';

export const dynamic = 'force-dynamic';

/**
 * A imagem do fluxograma de uma versão publicada do processo (decisão 139), só para quem está logado. Como no SVG
 * público, a política de segurança deixa passar só estilos e imagens embutidas: nenhum script roda.
 */
export async function GET(_: Request, { params }: { params: Promise<{ id: string; versao: string }> }) {
  try {
    await pessoaLogada();
    const { id, versao } = await params;
    const svg = await svgDaVersaoDoProcesso(id, versao);
    return new NextResponse(svg, {
      headers: {
        'content-type': 'image/svg+xml; charset=utf-8',
        'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:",
        'x-content-type-options': 'nosniff',
        'cache-control': 'private, max-age=300',
      },
    });
  } catch (e) {
    const status = e instanceof ErroApi ? e.status : 500;
    if (status >= 500) console.error(e);
    return new NextResponse(null, { status });
  }
}
