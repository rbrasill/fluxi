import { urlDeUploadAudio } from '@/lib/server/entrevistas';
import { responder } from '@/lib/server/http';
import { pessoaLogada } from '@/lib/server/sessao';

type Ctx = { params: Promise<{ id: string }> };

/** Uma URL assinada para o navegador da pessoa entrevistada subir a gravação da conversa. */
export const POST = (_: Request, { params }: Ctx) => responder(async () => urlDeUploadAudio((await params).id, await pessoaLogada()));
