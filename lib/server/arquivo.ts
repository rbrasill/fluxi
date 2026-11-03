import 'server-only';
import { NextResponse } from 'next/server';
import { ErroApi } from './http';

/** Resposta de download de um documento gerado (PDF ou DOCX), com o erro em JSON se falhar. */
export async function baixar(tipo: 'pdf' | 'docx', gerar: () => Promise<{ arquivo: Uint8Array | Buffer; nomeArquivo: string }>) {
  try {
    const { arquivo, nomeArquivo } = await gerar();
    return new NextResponse(new Uint8Array(arquivo), {
      headers: {
        'content-type': tipo === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'content-disposition': `attachment; filename="pop.${tipo}"; filename*=UTF-8''${encodeURIComponent(nomeArquivo)}`,
      },
    });
  } catch (e) {
    const status = e instanceof ErroApi ? e.status : 500;
    if (status >= 500) console.error(e);
    return NextResponse.json({ erro: e instanceof Error ? e.message : `Erro ao gerar o ${tipo.toUpperCase()}` }, { status });
  }
}
