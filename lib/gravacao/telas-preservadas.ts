import type { ConteudoPop } from '../pop/schema';

/**
 * Ao excluir uma gravação, quais telas dela estão em passos de POPs e passam a ser de qual POP.
 * O POP da própria gravação tem a preferência; uma tela usada em mais de um POP fica com o primeiro.
 */
export function distribuirTelas(telasDaGravacao: Set<string>, pops: { id: string; conteudo: ConteudoPop | null }[], popPreferido: string | null) {
  const ordem = [...pops].sort((a, b) => Number(b.id === popPreferido) - Number(a.id === popPreferido));
  const paraPop = new Map<string, string[]>();
  const usadas = new Set<string>();
  for (const o of ordem) {
    for (const p of o.conteudo?.procedimentos ?? []) {
      for (const s of p.passos) {
        if (!s.marcacao_id || usadas.has(s.marcacao_id) || !telasDaGravacao.has(s.marcacao_id)) continue;
        usadas.add(s.marcacao_id);
        paraPop.set(o.id, [...(paraPop.get(o.id) ?? []), s.marcacao_id]);
      }
    }
  }
  return { paraPop, usadas };
}
