import 'server-only';
import { ErroApi } from './http';
import { TENANT_PADRAO, supabase } from './supabase';

// Decisão 4: AssemblyAI (português, identificação de falantes).
const API = 'https://api.assemblyai.com/v2';
const BUCKET = 'gravacoes';

function chave() {
  const k = process.env.ASSEMBLYAI_API_KEY;
  if (!k) throw new ErroApi(500, 'Configure ASSEMBLYAI_API_KEY.');
  return k;
}

export async function urlDeUpload(nomeArquivo: string) {
  const limpo = nomeArquivo.normalize('NFD').replace(/[^\w.-]+/g, '_').slice(-80);
  const caminho = `tenants/${TENANT_PADRAO}/gravacoes/${crypto.randomUUID()}-${limpo}`;
  const { data, error } = await supabase().storage.from(BUCKET).createSignedUploadUrl(caminho);
  if (error) throw error;
  return { caminho, url: data.signedUrl };
}

export async function iniciar(caminho: string) {
  if (!caminho.startsWith(`tenants/${TENANT_PADRAO}/`)) throw new ErroApi(403, 'Arquivo inválido');
  const { data, error } = await supabase().storage.from(BUCKET).createSignedUrl(caminho, 60 * 60 * 3);
  if (error) throw error;
  const r = await fetch(`${API}/transcript`, {
    method: 'POST',
    headers: { authorization: chave(), 'content-type': 'application/json' },
    body: JSON.stringify({ audio_url: data.signedUrl, language_code: 'pt', speaker_labels: true, punctuate: true, format_text: true }),
  });
  const j = await r.json();
  if (!r.ok) throw new ErroApi(502, `AssemblyAI: ${j.error || r.status}`);
  return { id: j.id as string };
}

type Utterance = { speaker: string; text: string };

export async function consultar(id: string) {
  if (!/^[\w-]+$/.test(id)) throw new ErroApi(400, 'id inválido');
  const r = await fetch(`${API}/transcript/${id}`, { headers: { authorization: chave() } });
  const j = await r.json();
  if (!r.ok) throw new ErroApi(502, `AssemblyAI: ${j.error || r.status}`);
  if (j.status === 'error') return { status: 'erro' as const, erro: j.error as string };
  if (j.status !== 'completed') return { status: 'processando' as const };
  const texto = Array.isArray(j.utterances) && j.utterances.length
    ? (j.utterances as Utterance[]).map((u) => `Falante ${u.speaker}: ${u.text}`).join('\n')
    : (j.text as string);
  return { status: 'pronto' as const, texto, duracaoSeg: j.audio_duration as number };
}
