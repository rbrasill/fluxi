import 'server-only';
import { ErroApi } from './http';

// Groq (API compatível com a da OpenAI) para tarefas rápidas de texto (decisão 30).
// Cascata: openai/gpt-oss-120b; se falhar (limite, fora do ar, demora, resposta inválida),
// openai/gpt-oss-20b. Saída sempre em JSON validado por schema (Structured Outputs, modo estrito).
const URL_GROQ = 'https://api.groq.com/openai/v1/chat/completions';
export const MODELOS_GROQ = ['openai/gpt-oss-120b', 'openai/gpt-oss-20b'] as const;
export type ModeloGroq = (typeof MODELOS_GROQ)[number];

export type PedidoJson = {
  /** Instruções e conteúdo numa mensagem só (a Groq recomenda não usar system prompt nos modelos de raciocínio). */
  prompt: string;
  /** JSON Schema da resposta: no modo estrito, todo campo em `required` e `additionalProperties: false`. */
  schema: { nome: string; definicao: Record<string, unknown> };
  esforco?: 'low' | 'medium' | 'high';
  maxTokens?: number;
  temperatura?: number;
  /** Tempo máximo de cada modelo (ms). */
  limiteMs?: number;
};

class FalhaModelo extends Error {
  constructor(mensagem: string, readonly status?: number) { super(mensagem); }
}

async function chamar(modelo: ModeloGroq, p: PedidoJson, chave: string): Promise<unknown> {
  let r: Response;
  try {
    r = await fetch(URL_GROQ, {
      method: 'POST',
      signal: AbortSignal.timeout(p.limiteMs ?? 25_000),
      headers: { authorization: `Bearer ${chave}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        model: modelo,
        messages: [{ role: 'user', content: p.prompt }],
        temperature: p.temperatura ?? 0.4,
        max_completion_tokens: p.maxTokens ?? 4096, // inclui os tokens de raciocínio
        reasoning_effort: p.esforco ?? 'low',
        include_reasoning: false, // só a resposta (o raciocínio viria em message.reasoning)
        response_format: { type: 'json_schema', json_schema: { name: p.schema.nome, strict: true, schema: p.schema.definicao } },
      }),
    });
  } catch (e) {
    throw new FalhaModelo(e instanceof Error && e.name === 'TimeoutError' ? 'demorou demais' : `sem conexão (${e instanceof Error ? e.message : e})`);
  }
  const j = await r.json().catch(() => null) as { error?: { message?: string }; choices?: { finish_reason?: string; message?: { content?: string } }[] } | null;
  if (!r.ok) throw new FalhaModelo(`${r.status} ${j?.error?.message ?? ''}`.trim(), r.status);
  const escolha = j?.choices?.[0];
  if (escolha?.finish_reason === 'length') throw new FalhaModelo('resposta cortada no limite de tokens');
  try {
    return JSON.parse(escolha?.message?.content ?? '');
  } catch {
    throw new FalhaModelo('resposta fora do formato JSON');
  }
}

/**
 * Pede uma resposta em JSON, tentando os modelos em ordem. `validar` confere o formato (ex.: zod) e,
 * se lançar erro, conta como falha daquele modelo. Devolve o resultado e o modelo que respondeu.
 */
export async function completarJson<T>(p: PedidoJson, validar: (bruto: unknown) => T): Promise<{ resultado: T; modelo: ModeloGroq }> {
  const chave = process.env.GROQ_API_KEY;
  if (!chave) throw new ErroApi(503, 'A IA de texto ainda não está configurada (falta GROQ_API_KEY).');
  for (const [i, modelo] of MODELOS_GROQ.entries()) {
    try {
      return { resultado: validar(await chamar(modelo, p, chave)), modelo };
    } catch (e) {
      // Chave recusada vale para todos os modelos: não adianta tentar o próximo.
      if (e instanceof FalhaModelo && (e.status === 401 || e.status === 403)) {
        throw new ErroApi(502, 'A Groq recusou a chave (GROQ_API_KEY). Confira a chave nas variáveis de ambiente.');
      }
      const proximo = MODELOS_GROQ[i + 1];
      console.warn(`groq: ${modelo} falhou (${e instanceof Error ? e.message : e})${proximo ? `; tentando ${proximo}` : ''}`);
    }
  }
  throw new ErroApi(502, 'A IA não respondeu agora. Tente de novo em instantes.');
}
