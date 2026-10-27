import { NextResponse } from 'next/server';
import { ErroApi } from '@/lib/server/http';
import { pdf } from '@/lib/server/pops';

export const dynamic = 'force-dynamic';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { arquivo, nomeArquivo } = await pdf((await params).id, new URL(req.url).origin);
    return new NextResponse(new Uint8Array(arquivo), {
      headers: {
        'content-type': 'application/pdf',
        'content-disposition': `attachment; filename="pop.pdf"; filename*=UTF-8''${encodeURIComponent(nomeArquivo)}`,
      },
    });
  } catch (e) {
    const status = e instanceof ErroApi ? e.status : 500;
    console.error(e);
    return NextResponse.json({ erro: e instanceof Error ? e.message : 'Erro ao gerar o PDF' }, { status });
  }
}
