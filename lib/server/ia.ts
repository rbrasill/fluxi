import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';
import { FluxoSchema, type Fluxo } from '@/lib/fluxo/schema';
import { ErroApi } from './http';

// Decisão 7: Claude Sonnet 5.5 via API da Anthropic.
const MODELO = 'claude-sonnet-5-5';

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
// Chaves sem workspace próprio exigem o id do workspace no cabeçalho (ANTHROPIC_WORKSPACE_ID).
const claude = () =>
  (cliente ??= new Anthropic(
    process.env.ANTHROPIC_WORKSPACE_ID ? { defaultHeaders: { 'anthropic-workspace-id': process.env.ANTHROPIC_WORKSPACE_ID } } : {},
  ));

async function chamarEstruturado<T extends z.ZodTypeAny>(schema: T, sistema: string, conteudo: string, maxTokens = 16000): Promise<z.infer<T>> {
  if (!process.env.ANTHROPIC_API_KEY) throw new ErroApi(503, 'A geração por IA ainda não está configurada (falta ANTHROPIC_API_KEY). Crie manualmente por enquanto.');
  try {
    const resposta = await claude().beta.messages.parse({
      model: MODELO,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      max_tokens: maxTokens,
      thinking: { type: 'adaptive' },
      output_config: { effort: 'medium', format: zodOutputFormat(schema) },
      system: [{ type: 'text', text: sistema, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: conteudo }],
    }, { timeout: 290_000 }); // cabe no maxDuration (300 s) da rota
    if (resposta.stop_reason === 'refusal') throw new ErroApi(422, 'A IA não conseguiu processar este conteúdo.');
    if (resposta.stop_reason === 'max_tokens') throw new ErroApi(422, 'O processo ficou grande demais para gerar de uma vez. Tente uma gravação menor.');
    if (!resposta.parsed_output) throw new ErroApi(502, 'A IA devolveu uma resposta inválida. Tente novamente.');
    return resposta.parsed_output as z.infer<T>;
  } catch (e) {
    if (e instanceof ErroApi) throw e;
    if (e instanceof Anthropic.AuthenticationError) throw new ErroApi(500, 'Chave da Anthropic inválida (ANTHROPIC_API_KEY).');
    if (e instanceof Anthropic.RateLimitError) throw new ErroApi(429, 'Muitas solicitações à IA agora. Tente em instantes.');
    if (e instanceof Anthropic.APIError) {
      console.error('Erro na API da Anthropic:', e.status, e.message);
      throw new ErroApi(502, `Erro na IA (${e.status}). Tente novamente.`);
    }
    throw e;
  }
}

// --- Gravação de tela → POP + fluxograma numa única chamada (a transcrição é enviada uma vez só) ---

export const AnaliseGravacaoSchema = z.object({
  fluxo: FluxoSchema,
  pop: z.object({
    area: z.string().describe('Área dona do processo'),
    executor: z.string().describe('Cargo que executa o processo'),
    objetivo: z.string().describe('Para que serve o procedimento, em 1 a 3 frases'),
    envolvidos: z.array(z.object({ area: z.string(), cargo: z.string() })),
    procedimentos: z.array(
      z.object({
        nome: z.string(),
        passos: z.array(
          z.object({
            texto: z.string().describe('Instrução no imperativo, curta e objetiva'),
            tela: z.string().optional().describe('id da tela marcada que ilustra este passo, se houver'),
          }),
        ),
      }),
    ),
  }),
  telas: z
    .array(z.object({ id: z.string(), instrucao: z.string().describe('Instrução para a tela, escrita a partir do que foi dito perto do momento em que foi marcada') }))
    .describe('Uma entrada para cada tela marcada, na mesma ordem recebida'),
});
export type AnaliseGravacao = z.infer<typeof AnaliseGravacaoSchema>;

const SISTEMA_GRAVACAO = `${SISTEMA}

Você também vai redigir o POP (Procedimento Operacional Padrão) do mesmo processo.
Recebe a transcrição da narração de uma gravação de tela (com tempo [mm:ss] e falante) e a lista de telas que a pessoa marcou durante a gravação, cada uma com id, momento e, às vezes, uma instrução digitada.

Regras do POP:
- Procedimentos agrupam passos por etapa ou por área; nomes curtos (ex.: "Cadastro da proposta").
- Passos no imperativo, um por ação, na ordem em que são feitos ("Clique em Nova proposta", "Preencha o CPF do cliente").
- Toda tela marcada deve aparecer em exatamente um passo (campo "tela"), no ponto do procedimento correspondente ao momento em que foi marcada.
- Se a pessoa digitou uma instrução para a tela, respeite-a e só melhore a clareza.
- Para telas sem instrução, escreva a instrução a partir do que foi dito nos segundos antes e logo depois do momento marcado.
- Envolvidos: pares área e cargo citados ou claramente implicados.
- Não invente sistemas, campos ou regras que não foram ditos.`;

export async function analisarGravacao(transcricao: string, telas: { id: string; momento: string; instrucao?: string | null }[]) {
  const lista = telas.length
    ? telas.map((t) => `- id ${t.id} · momento ${t.momento}${t.instrucao ? ` · instrução digitada: "${t.instrucao}"` : ' · sem instrução'}`).join('\n')
    : '(nenhuma tela marcada)';
  return chamarEstruturado(
    AnaliseGravacaoSchema,
    SISTEMA_GRAVACAO,
    `<transcricao>\n${transcricao}\n</transcricao>\n\n<telas_marcadas>\n${lista}\n</telas_marcadas>`,
    32000,
  );
}

export async function extrairFluxo(texto: string, origem: 'descricao' | 'transcricao'): Promise<Fluxo> {
  if (!process.env.ANTHROPIC_API_KEY) throw new ErroApi(503, 'A geração por IA ainda não está configurada (falta ANTHROPIC_API_KEY). Crie o fluxograma manualmente por enquanto.');
  const intro =
    origem === 'transcricao'
      ? 'Transcrição da reunião de mapeamento do processo:'
      : 'Descrição do processo:';
  try {
    const resposta = await claude().beta.messages.parse({
      model: MODELO,
      // Se o modelo recusar por engano (filtro de segurança), a API refaz com um modelo alternativo.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
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
    if (e instanceof Anthropic.APIError) {
      console.error('Erro na API da Anthropic:', e.status, e.message);
      throw new ErroApi(502, `Erro na IA (${e.status}). Tente novamente.`);
    }
    throw e;
  }
}
