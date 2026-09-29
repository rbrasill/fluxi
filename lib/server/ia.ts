import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { FluxoSchema, type Fluxo } from '@/lib/fluxo/schema';
import { ErroApi } from './http';

// Decisão 7: Claude Sonnet 5 via API da Anthropic.
const MODELO = 'claude-sonnet-5';

const SISTEMA = `Você é especialista em mapeamento de processos e notação BPMN.
Recebe a descrição de um processo ou a transcrição de uma reunião em que pessoas explicam como trabalham, e devolve a estrutura do fluxograma.

Regras:
- Uma raia por área ou papel que executa atividades (ex.: Comercial, Financeiro, Cliente). Use os nomes que aparecem no texto.
- Exatamente um evento de início (tipo "inicio") e pelo menos um fim ("fim").
- Tarefas: verbo no infinitivo + objeto, curtas (ex.: "Analisar crédito do cliente").
- Decisões viram "gateway_exclusivo" com uma pergunta terminada em "?" e saídas rotuladas "Sim"/"Não" (ou a condição).
- Atividades simultâneas: "gateway_paralelo" para abrir e outro para juntar.
- Todo nó, exceto o início, precisa ter uma conexão de entrada; todo nó, exceto o fim, uma de saída.
- Ids curtos e únicos (r1, r2… para raias; n1, n2… para nós).
- Em transcrições, ignore conversa que não descreve o processo (saudações, desvios). Não invente etapas que não foram ditas; quando algo ficar ambíguo, registre uma anotação do tipo "alerta" no nó.
- Escreva tudo em português do Brasil.`;

let cliente: Anthropic | null = null;
const claude = () => (cliente ??= new Anthropic());

export async function extrairFluxo(texto: string, origem: 'descricao' | 'transcricao'): Promise<Fluxo> {
  const intro =
    origem === 'transcricao'
      ? 'Transcrição da reunião de mapeamento do processo:'
      : 'Descrição do processo:';
  try {
    const resposta = await claude().messages.parse({
      model: MODELO,
      max_tokens: 16000,
      thinking: { type: 'adaptive' },
      output_config: { effort: 'medium', format: zodOutputFormat(FluxoSchema) },
      system: [{ type: 'text', text: SISTEMA, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: `${intro}\n\n<texto>\n${texto}\n</texto>` }],
    });
    if (resposta.stop_reason === 'refusal') throw new ErroApi(422, 'A IA não conseguiu processar este texto.');
    if (resposta.stop_reason === 'max_tokens') throw new ErroApi(422, 'O processo ficou grande demais para gerar de uma vez. Tente dividir o texto.');
    if (!resposta.parsed_output) throw new ErroApi(502, 'A IA devolveu uma resposta inválida. Tente novamente.');
    return resposta.parsed_output;
  } catch (e) {
    if (e instanceof ErroApi) throw e;
    if (e instanceof Anthropic.AuthenticationError) throw new ErroApi(500, 'Chave da Anthropic inválida ou ausente (ANTHROPIC_API_KEY).');
    if (e instanceof Anthropic.RateLimitError) throw new ErroApi(429, 'Muitas solicitações à IA agora. Tente em instantes.');
    if (e instanceof Anthropic.APIError) throw new ErroApi(502, `Erro na IA (${e.status}). Tente novamente.`);
    throw e;
  }
}
