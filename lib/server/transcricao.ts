import 'server-only';
import { ErroApi } from './http';
import { TENANT_PADRAO, supabase } from './supabase';

// Decisão 4: AssemblyAI. Configuração pensada para custo baixo (ver docs/decisoes.md, decisão 16):
// - Universal-3.5 Pro (US$ 0,21/h), com Universal-2 como reserva automática;
// - só identificação de falantes (+US$ 0,02/h); sem keyterms, PII ou outros extras pagos;
// - idioma fixo (pt), sem detecção automática;
// - cada áudio é transcrito uma vez (o texto fica salvo no Fluxi) e o original é apagado no AssemblyAI.
const API = 'https://api.assemblyai.com/v2';
const BUCKET = 'gravacoes';
export const CONFIG_TRANSCRICAO = {
  speech_models: ['universal-3-5-pro', 'universal-2'],
  language_code: 'pt',
  speaker_labels: true,
  punctuate: true,
  format_text: true,
} as const;

function chave() {
  const k = process.env.ASSEMBLYAI_API_KEY;
  if (!k) throw new ErroApi(503, 'A transcrição ainda não está configurada (falta ASSEMBLYAI_API_KEY).');
  return k;
}

async function chamar<T>(caminho: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`${API}${caminho}`, { ...init, headers: { authorization: chave(), 'content-type': 'application/json', ...init?.headers } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new ErroApi(502, `AssemblyAI: ${j.error || r.status}`);
  return j as T;
}

export type Fala = { falante: string; inicio_ms: number; fim_ms: number; texto: string };

/** Envia um arquivo do Storage (link temporário) para transcrever. */
export async function iniciarDoStorage(caminho: string) {
  const { data, error } = await supabase().storage.from(BUCKET).createSignedUrl(caminho, 60 * 60 * 6);
  if (error) throw error;
  const j = await chamar<{ id: string }>('/transcript', { method: 'POST', body: JSON.stringify({ audio_url: data.signedUrl, ...CONFIG_TRANSCRICAO }) });
  return j.id;
}

type Resposta = {
  status: 'queued' | 'processing' | 'completed' | 'error';
  error?: string;
  text?: string;
  audio_duration?: number;
  utterances?: { speaker: string; start: number; end: number; text: string }[];
};

/** Consulta; quando pronta, devolve as falas com o tempo deslocado para a gravação inteira. */
export async function consultarFalas(id: string, deslocamentoMs = 0) {
  if (!/^[\w-]+$/.test(id)) throw new ErroApi(400, 'id inválido');
  const j = await chamar<Resposta>(`/transcript/${id}`);
  if (j.status === 'error') return { status: 'erro' as const, erro: j.error ?? 'erro desconhecido' };
  if (j.status !== 'completed') return { status: 'processando' as const };
  const falas: Fala[] = (j.utterances ?? []).map((u) => ({
    falante: u.speaker,
    inicio_ms: u.start + deslocamentoMs,
    fim_ms: u.end + deslocamentoMs,
    texto: u.text,
  }));
  if (!falas.length && j.text) falas.push({ falante: 'A', inicio_ms: deslocamentoMs, fim_ms: deslocamentoMs, texto: j.text });
  return { status: 'pronta' as const, falas, duracaoSeg: j.audio_duration ?? 0 };
}

/** Apaga a transcrição no AssemblyAI (LGPD): o texto já está salvo no Fluxi. */
export async function excluirRemota(id: string) {
  await chamar(`/transcript/${id}`, { method: 'DELETE' }).catch(() => {});
}

// --- Fluxo antigo (áudio avulso enviado no "Novo fluxograma") ---

export async function urlDeUpload(nomeArquivo: string) {
  const limpo = nomeArquivo.normalize('NFD').replace(/[^\w.-]+/g, '_').slice(-80);
  const caminho = `tenants/${TENANT_PADRAO}/audios/${crypto.randomUUID()}-${limpo}`;
  const { data, error } = await supabase().storage.from(BUCKET).createSignedUploadUrl(caminho);
  if (error) throw error;
  return { caminho, url: data.signedUrl };
}

export async function iniciar(caminho: string) {
  if (!caminho.startsWith(`tenants/${TENANT_PADRAO}/`)) throw new ErroApi(403, 'Arquivo inválido');
  return { id: await iniciarDoStorage(caminho) };
}

export async function consultar(id: string) {
  const r = await consultarFalas(id);
  if (r.status !== 'pronta') return r;
  void excluirRemota(id);
  return { status: 'pronta' as const, texto: formatarFalas(r.falas), duracaoSeg: r.duracaoSeg };
}

export function formatarFalas(falas: Fala[], comTempo = false) {
  const mmss = (ms: number) => `${String(Math.floor(ms / 60000)).padStart(2, '0')}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, '0')}`;
  return falas.map((f) => `${comTempo ? `[${mmss(f.inicio_ms)}] ` : ''}Falante ${f.falante}: ${f.texto}`).join('\n');
}
