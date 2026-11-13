import 'server-only';
import { NextResponse } from 'next/server';
import { ErroApi, respostaDeErro } from './http';

/**
 * Resposta de download do PDF gerado, com o erro em JSON se falhar.
 * Exige a pessoa logada (decisão 50), menos nas páginas públicas (`publico`).
 */
export async function baixar(tipo: 'pdf', gerar: () => Promise<{ arquivo: Uint8Array | Buffer; nomeArquivo: string }>, opcoes: { publico?: boolean } = {}) {
  if (!opcoes.publico) {
    try { await (await import('./sessao')).pessoaLogada(); } catch (e) { return respostaDeErro(e); }
  }
  try {
    const { arquivo, nomeArquivo } = await gerar();
    return new NextResponse(new Uint8Array(arquivo), {
      headers: {
        'content-type': 'application/pdf',
        'content-disposition': `attachment; filename="pop.${tipo}"; filename*=UTF-8''${encodeURIComponent(nomeArquivo)}`,
      },
    });
  } catch (e) {
    const status = e instanceof ErroApi ? e.status : 500;
    if (status >= 500) console.error(e);
    return NextResponse.json({ erro: e instanceof Error ? e.message : `Erro ao gerar o ${tipo.toUpperCase()}` }, { status });
  }
}
