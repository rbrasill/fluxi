import 'server-only';
import * as fluxogramas from './fluxogramas';
import * as gravacoes from './gravacoes';
import { ErroApi } from './http';
import * as pops from './pops';
import { TENANT_PADRAO, supabase } from './supabase';

// Exclusão definitiva (decisão 31): só o que está arquivado pode ser excluído, e vai tudo junto
// (POPs, gravações com vídeo e telas, fluxograma), para nunca sobrar item sem processo.

export async function excluirProcesso(id: string) {
  const db = supabase();
  const { data: p, error } = await db.from('processos').select('id, arquivado_em').eq('tenant_id', TENANT_PADRAO).eq('id', id).maybeSingle();
  if (error) throw error;
  if (!p) throw new ErroApi(404, 'Processo não encontrado');
  if (!p.arquivado_em) throw new ErroApi(409, 'Arquive o processo antes de excluir.');

  const [o, g, f] = await Promise.all([
    db.from('pops').select('id').eq('tenant_id', TENANT_PADRAO).eq('processo_id', id),
    db.from('gravacoes').select('id').eq('tenant_id', TENANT_PADRAO).eq('processo_id', id),
    db.from('fluxogramas').select('id').eq('tenant_id', TENANT_PADRAO).eq('processo_id', id),
  ]);
  for (const r of [o, g, f]) if (r.error) throw r.error;
  // Os arquivos ficam no Storage: cada exclusão apaga a pasta do item antes da linha.
  for (const x of o.data ?? []) await pops.excluirDefinitivo(x.id);
  for (const x of g.data ?? []) await gravacoes.excluir(x.id);
  for (const x of f.data ?? []) await fluxogramas.excluir(x.id);
  const { error: e } = await db.from('processos').delete().eq('tenant_id', TENANT_PADRAO).eq('id', id);
  if (e) throw e;
  return { ok: true };
}

export async function excluirPop(id: string) {
  const { data: o, error } = await supabase().from('pops').select('id, arquivado_em, processo:processos(arquivado_em)').eq('tenant_id', TENANT_PADRAO).eq('id', id).maybeSingle();
  if (error) throw error;
  if (!o) throw new ErroApi(404, 'POP não encontrado');
  if (!o.arquivado_em && !(o.processo as unknown as { arquivado_em: string | null } | null)?.arquivado_em) throw new ErroApi(409, 'Arquive o POP antes de excluir.');
  return pops.excluirDefinitivo(id);
}
