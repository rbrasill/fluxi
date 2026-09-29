import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Sem login no MVP: todas as operações usam o tenant padrão.
export const TENANT_PADRAO = process.env.FLUXI_TENANT_ID || '00000000-0000-4000-8000-000000000001';

let cliente: SupabaseClient | null = null;

export function supabase(): SupabaseClient {
  if (cliente) return cliente;
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !chave) throw new Error('Configure SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.');
  cliente = createClient(url, chave, { auth: { persistSession: false } });
  return cliente;
}
