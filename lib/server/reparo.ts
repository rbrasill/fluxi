import 'server-only';
import { repararPartes as reparar, type Parte } from '@/lib/gravacao/reparo';
import { TENANT_PADRAO, supabase } from './supabase';
import { BUCKET } from './telas';

// Conserta no Storage as partes gravadas com o defeito do gravador (ver lib/gravacao/reparo.ts).

async function baixar(caminho: string, ate?: number) {
  const { data, error } = await supabase().storage.from(BUCKET).createSignedUrl(caminho, 600);
  if (error) throw error;
  const r = await fetch(data.signedUrl, ate ? { headers: { range: `bytes=0-${ate - 1}` } } : undefined);
  if (!r.ok) throw new Error(`Storage respondeu ${r.status} ao baixar ${caminho}`);
  return new Uint8Array(await r.arrayBuffer());
}

/** Conserta as partes da gravação que começam fora do cabeçalho. Devolve quantas foram consertadas. */
export async function repararPartes(gravacaoId: string) {
  const db = supabase();
  const { data, error } = await db.from('gravacao_segmentos').select('indice, caminho, duracao_ms, mime')
    .eq('tenant_id', TENANT_PADRAO).eq('gravacao_id', gravacaoId).order('indice');
  if (error) throw error;
  return reparar((data ?? []) as Parte[], {
    baixar,
    gravar: async (parte, bytes) => {
      const { error: e1 } = await db.storage.from(BUCKET).upload(parte.caminho, bytes, { upsert: true, contentType: parte.mime });
      if (e1) throw e1;
      const { error: e2 } = await db.from('gravacao_segmentos').update({ bytes: bytes.length })
        .eq('tenant_id', TENANT_PADRAO).eq('gravacao_id', gravacaoId).eq('indice', parte.indice);
      if (e2) throw e2;
    },
  });
}
