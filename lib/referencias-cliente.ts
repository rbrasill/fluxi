// Cliente da busca de referências (decisão 35): POPs e processos para citar num texto.
import { ErroCliente } from './fluxogramas';
import type { Doc, ResultadoBusca } from './referencias';

export async function buscarReferencias(q: string, excluir?: Doc | null): Promise<ResultadoBusca[]> {
  const p = new URLSearchParams({ q });
  if (excluir) p.set('excluir', `${excluir.tipo}:${excluir.id}`);
  const r = await fetch(`/api/referencias?${p}`);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new ErroCliente(j.erro || `Erro ${r.status}`, r.status);
  return j as ResultadoBusca[];
}
