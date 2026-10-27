import { z } from 'zod';
import { gerarXml } from '@/lib/fluxo/gerar-xml';
import { criar } from '@/lib/server/fluxogramas';
import { responder } from '@/lib/server/http';
import { extrairFluxo } from '@/lib/server/ia';

export const maxDuration = 300;

const Pedido = z.object({
  nome: z.string().trim().max(200).optional(),
  texto: z.string().trim().min(30, 'Descreva o processo com mais detalhes.').max(400_000),
  origem: z.enum(['descricao', 'transcricao']),
  processo_id: z.string().uuid().optional(),
});

export const POST = (req: Request) =>
  responder(async () => {
    const p = Pedido.parse(await req.json());
    const fluxo = await extrairFluxo(p.texto, p.origem);
    return criar({ nome: p.nome || fluxo.titulo, xml: gerarXml(fluxo), origem: 'ia', schema: fluxo, processo_id: p.processo_id });
  });
