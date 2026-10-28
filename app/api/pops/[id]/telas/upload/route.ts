import { z } from 'zod';
import { responder } from '@/lib/server/http';
import { urlDeUploadTela } from '@/lib/server/pops';

export const POST = (req: Request, { params }: { params: Promise<{ id: string }> }) =>
  responder(async () => urlDeUploadTela((await params).id, z.object({ extensao: z.string().min(1).max(5) }).parse(await req.json()).extensao));
