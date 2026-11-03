import { baixar } from '@/lib/server/arquivo';
import { pdf } from '@/lib/server/pops';

export const dynamic = 'force-dynamic';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return baixar('pdf', () => pdf(id, new URL(req.url).origin));
}
