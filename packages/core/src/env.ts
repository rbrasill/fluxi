import { z } from 'zod';

// Lê e valida as variáveis de ambiente. Os valores vêm do .env (local, fora do Git)
// ou das Environment Variables da Vercel. Nenhum valor padrão: se faltar, falha na inicialização.

const publicSchema = z.object({
  VITE_SUPABASE_URL: z.string().url(),
  VITE_SUPABASE_ANON_KEY: z.string().min(1),
});

const serverSchema = publicSchema.extend({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  DATABASE_URL: z.string().url(),
  ANTHROPIC_API_KEY: z.string().min(1),
  ASSEMBLYAI_API_KEY: z.string().min(1),
  ASSEMBLYAI_WEBHOOK_SECRET: z.string().min(1),
  NOTION_TOKEN: z.string().min(1).optional(),
});

function parse<T extends z.ZodTypeAny>(schema: T, source: Record<string, string | undefined>): z.infer<T> {
  const result = schema.safeParse(source);
  if (!result.success) {
    const faltando = result.error.issues.map((i) => i.path.join('.')).join(', ');
    throw new Error(`Variáveis de ambiente ausentes ou inválidas: ${faltando}`);
  }
  return result.data;
}

/** Variáveis seguras para o navegador. */
export const publicEnv = () => parse(publicSchema, process.env);

/** Variáveis do servidor (API, worker). Nunca importar no front-end. */
export const serverEnv = () => parse(serverSchema, process.env);
