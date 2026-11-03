import { responder } from '@/lib/server/http';
import { avancar, iniciar } from '@/lib/server/processamento';

type Ctx = { params: Promise<{ id: string }> };

export const dynamic = 'force-dynamic';
// Preparar e enviar as partes do áudio pode levar um ou dois minutos em gravações longas.
export const maxDuration = 300;
export const POST = (_: Request, { params }: Ctx) => responder(async () => iniciar((await params).id));
export const GET = (_: Request, { params }: Ctx) => responder(async () => avancar((await params).id));
