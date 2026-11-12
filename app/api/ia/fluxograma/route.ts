import { z } from 'zod';
import { gerarXml } from '@/lib/fluxo/gerar-xml';
import { MAX_CONVERSAS_FLUXO } from '@/lib/entrevista/topicos';
import { textoParaFluxograma } from '@/lib/server/entrevistas';
import { criar } from '@/lib/server/fluxogramas';
import { ErroApi, responder } from '@/lib/server/http';
import { extrairFluxo } from '@/lib/server/ia';

export const maxDuration = 300;

// O fluxograma nasce de um texto (descrição ou transcrição de reunião) ou de conversas com a Maia sobre o
// processo (decisão 63): nesse caso vêm os ids das conversas, e o servidor monta o texto.
const Pedido = z.object({
  nome: z.string().trim().max(200).optional(),
  texto: z.string().trim().max(400_000).optional(),
  entrevistas: z.array(z.string().uuid()).min(1, 'Escolha pelo menos uma conversa.').max(MAX_CONVERSAS_FLUXO, `Escolha até ${MAX_CONVERSAS_FLUXO} conversas.`).optional(),
  origem: z.enum(['descricao', 'transcricao', 'entrevista']),
  processo_id: z.string().uuid().optional(),
  substituir: z.boolean().optional(), // o processo já tem fluxograma: troca o desenho
});

export const POST = (req: Request) =>
  responder(async () => {
    const p = Pedido.parse(await req.json());
    let texto: string;
    if (p.origem === 'entrevista') {
      if (!p.processo_id || !p.entrevistas?.length) throw new ErroApi(400, 'Escolha pelo menos uma conversa com a Maia deste processo.');
      texto = await textoParaFluxograma(p.processo_id, p.entrevistas);
    } else {
      if ((p.texto ?? '').length < 30) throw new ErroApi(400, 'Descreva o processo com mais detalhes.');
      texto = p.texto!;
    }
    const fluxo = await extrairFluxo(texto, p.origem);
    return criar({ nome: p.nome || fluxo.titulo, xml: gerarXml(fluxo), origem: 'ia', schema: fluxo, processo_id: p.processo_id, substituir: p.substituir });
  });
