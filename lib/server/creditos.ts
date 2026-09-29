import 'server-only';
import { ErroApi } from './http';
import { TENANT_PADRAO, supabase } from './supabase';

// Custo em créditos de cada operação de IA.
export const CUSTO = { fluxograma: 1, transcricao: 1 } as const;

export async function saldo(): Promise<number> {
  const { data, error } = await supabase().from('tenants').select('creditos_ia').eq('id', TENANT_PADRAO).single();
  if (error) throw error;
  return data.creditos_ia;
}

export async function garantirSaldo(tipo: keyof typeof CUSTO) {
  if ((await saldo()) < CUSTO[tipo]) {
    throw new ErroApi(402, 'Seus créditos de IA acabaram. Você pode continuar criando o fluxograma manualmente.', 'sem_creditos');
  }
}

export async function debitar(tipo: keyof typeof CUSTO, detalhes?: Record<string, unknown>) {
  const { data, error } = await supabase().rpc('debitar_creditos', {
    p_tenant: TENANT_PADRAO, p_qtd: CUSTO[tipo], p_tipo: tipo, p_detalhes: detalhes ?? null,
  });
  if (error) throw error;
  if (data === null) throw new ErroApi(402, 'Seus créditos de IA acabaram.', 'sem_creditos');
  return data as number;
}
