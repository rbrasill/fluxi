import { gerarPdfDasRegras } from '@/lib/regras/pdf';
import { baixar } from '@/lib/server/arquivo';
import { documento } from '@/lib/server/regras';

export const dynamic = 'force-dynamic';

/** As regras confirmadas do processo em PDF (decisão 107). */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return baixar('pdf', async () => {
    const d = await documento(id);
    return { arquivo: await gerarPdfDasRegras(d), nomeArquivo: `Regras de negócio - ${d.processo}.pdf` };
  });
}
