import { urlDeUploadAudio } from '@/lib/server/entrevistas';
import { responder } from '@/lib/server/http';

type Ctx = { params: Promise<{ id: string }> };

/** URL assinada para o navegador enviar o áudio da conversa direto ao Storage. */
export const POST = (_: Request, { params }: Ctx) => responder(async () => urlDeUploadAudio((await params).id));
