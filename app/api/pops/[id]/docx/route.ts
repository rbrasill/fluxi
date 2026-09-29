import { NextResponse } from 'next/server';
import { ErroApi } from '@/lib/server/http';
import { docx } from '@/lib/server/pops';

export const dynamic = 'force-dynamic';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { arquivo, nomeArquivo } = await docx((await params).id, new URL(req.url).origin);
    return new NextResponse(new Uint8Array(arquivo), {
      headers: {
        'content-type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'content-disposition': `attachment; filename="pop.docx"; filename*=UTF-8''${encodeURIComponent(nomeArquivo)}`,
      },
    });
  } catch (e) {
    const status = e instanceof ErroApi ? e.status : 500;
    console.error(e);
    return NextResponse.json({ erro: e instanceof Error ? e.message : 'Erro ao gerar o DOCX' }, { status });
  }
}
