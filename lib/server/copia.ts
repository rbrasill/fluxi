import 'server-only';
import { garantir as garantirArea } from './areas';
import * as fluxogramas from './fluxogramas';
import * as pops from './pops';
import * as processos from './processos';
import * as referencias from './referencias';

// Cópia de processo (decisão 36): processo novo na área escolhida, com a descrição, o fluxograma e
// cópias dos POPs ativos (como rascunho, com os prints). Gravações de tela e páginas públicas não
// vão: a cópia tem links próprios.

export async function copiarProcesso(id: string, p: { area_id: string; nome?: string }) {
  const origem = await processos.obter(id);
  const area = await garantirArea(p.area_id);
  const nome = p.nome?.trim() || (origem.area_id === area.id ? `${origem.nome} (cópia)` : origem.nome);
  const descricao = (origem.descricao as string | null) ?? '';
  const novo = await processos.criar({ nome, area_id: area.id, descricao });
  if (descricao) await referencias.indexar({ tipo: 'processo', id: novo.id as string }, [{ campo: 'descricao', valor: descricao }]);

  let fluxograma = false;
  if (origem.fluxograma) {
    const f = await fluxogramas.obter(origem.fluxograma.id as string);
    const nf = await fluxogramas.criar({ nome: f.nome as string, xml: (f.xml as string) ?? '', origem: f.origem as fluxogramas.Origem, schema: f.schema, processo_id: novo.id as string });
    // A miniatura e o SVG publicado vão junto: a página pública da cópia já abre com o desenho.
    const imagens = await fluxogramas.imagensDe(f.id as string);
    if (imagens.miniatura || imagens.svg) await fluxogramas.atualizar(nf.id as string, imagens);
    fluxograma = true;
  }

  const ativos = origem.pops.filter((o) => !o.arquivado_em);
  for (const o of ativos) await pops.copiar(o.id as string, { processo_id: novo.id as string, nome: o.nome as string });
  return { id: novo.id as string, pops: ativos.length, fluxograma };
}
