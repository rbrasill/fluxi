import { z } from 'zod';
import { abrirSessao } from '@/lib/server/entrevistas';
import { responder } from '@/lib/server/http';
import { pessoaLogada } from '@/lib/server/sessao';

type Ctx = { params: Promise<{ id: string }> };
export const maxDuration = 30;

/** Aquece a função: a tela da entrevista chama ao abrir, para o clique em "Começar" não pagar a partida a frio. */
export const GET = () => Response.json({ pronto: true });

/** Abre a sessão de voz no GPT-Live: recebe a oferta WebRTC do navegador e devolve a resposta (SDP). */
export const POST = (req: Request, { params }: Ctx) =>
  responder(async () => abrirSessao((await params).id, z.object({ sdp: z.string().min(10).max(50_000) }).parse(await req.json()).sdp, await pessoaLogada()));
