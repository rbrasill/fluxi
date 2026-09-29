// Qualidade da gravação no MVP (Supabase: 50 MB por arquivo).
// Telas de sistema comprimem muito bem em VP9: 1080p a 1,5 Mbps fica nítido.
// A gravação é dividida em segmentos independentes de 3 min (~35 MB cada),
// então não há limite de duração total. Para um storage sem esse limite,
// basta aumentar SEGMENTO_MS e a taxa de bits.
export const QUALIDADE = {
  largura: 1920,
  altura: 1080,
  quadrosPorSegundo: 15,
  videoBps: 1_500_000,
  audioBps: 96_000,
};

export const SEGMENTO_MS = 3 * 60 * 1000;
export const LIMITE_ARQUIVO_BYTES = 50 * 1024 * 1024;

// Ordem de preferência; o primeiro suportado pelo navegador é usado.
export const FORMATOS = [
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
  'video/mp4;codecs=avc1,opus',
  'video/mp4',
];

export function formatoSuportado(): string {
  if (typeof MediaRecorder === 'undefined') return '';
  return FORMATOS.find((f) => MediaRecorder.isTypeSupported(f)) ?? '';
}

export const extensaoDe = (mime: string) => (mime.startsWith('video/mp4') ? 'mp4' : 'webm');
