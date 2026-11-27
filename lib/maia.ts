// Cliente do Painel da Maia (decisão 52): só administradores. Custos, tempos e métricas das entrevistas e
// a configuração da Maia, para acompanhar o uso sem mostrar nada disso a quem é entrevistado.
import type { Finalidade, StatusEntrevista } from './entrevista/topicos';
import { ErroCliente } from './fluxogramas';

export type ConfiguracaoMaia = {
  nome: string; apresentacao: string; modelo_voz: string; voz: string; preco_voz_usd_min: number;
  modelo_consulta: string; modelo_analise: string; frase_final: string; frase_pausa: string;
  sessao_min: number; inatividade_min: number; max_consultas: number;
  /** As finalidades da entrevista (decisão 89), com os assuntos que a Maia cobre em cada uma; `ligada`: já disponível neste ambiente. */
  finalidades: { id: Finalidade; rotulo: string; resumo: string; topicos: string[]; ligada: boolean }[];
};
export type EntrevistaPainel = {
  finalidade: Finalidade;
  id: string; tema: string; status: StatusEntrevista; em_ligacao: boolean; arquivada: boolean; entrevistado: string | null; processo: string | null; criado_em: string; encerrado_em: string | null;
  falas: number; duracao_s: number; sessoes: number; pausas: number; consultas: number; reacao_mediana_ms: number | null; conexao_ms: number | null;
  custo_voz_usd: number; custo_consultas_usd: number; custo_analise_usd: number; custo_total_usd: number; erros: number;
};
export type PainelMaia = { configuracao: ConfiguracaoMaia; entrevistas: EntrevistaPainel[] };

export async function obterPainelDaMaia(): Promise<PainelMaia> {
  const r = await fetch('/api/maia');
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new ErroCliente(j.erro || `Erro ${r.status}`, r.status, j.codigo);
  return j as PainelMaia;
}
