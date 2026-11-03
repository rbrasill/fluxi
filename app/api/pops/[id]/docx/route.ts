import { baixar } from '@/lib/server/arquivo';
import { docx } from '@/lib/server/pops';

export const dynamic = 'force-dynamic';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return baixar('docx', () => docx(id, new URL(req.url).origin));
}
