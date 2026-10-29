import fixWebmDuration from 'fix-webm-duration';

// Partes gravadas antes da correção do gravador (decisão 27): na troca de parte, o último pedaço
// da parte anterior entrava no começo da seguinte, antes do cabeçalho. O arquivo começava no meio
// do vídeo e nenhum programa conseguia abrir (o AssemblyAI respondia "Transcoding failed").
// O conserto devolve esses bytes para o fim da parte anterior, de onde vieram.

export type Parte = { indice: number; caminho: string; duracao_ms: number; mime: string };
export type Acesso = {
  /** Baixa o arquivo (ou só os primeiros `ate` bytes). */
  baixar: (caminho: string, ate?: number) => Promise<Uint8Array>;
  /** Substitui o arquivo da parte. */
  gravar: (parte: Parte, bytes: Uint8Array) => Promise<void>;
};

const AMOSTRA = 1024 * 1024; // o pedaço que sobra é de até 1 s de vídeo (~200 KB)

/** Onde o arquivo de verdade começa: cabeçalho EBML do WebM ou caixa "ftyp" do MP4. -1 se não achar. */
export function inicioDoArquivo(b: Uint8Array, mime: string): number {
  if (mime.includes('mp4')) {
    for (let i = 4; i + 4 <= b.length; i++) {
      if (b[i] !== 0x66 || b[i + 1] !== 0x74 || b[i + 2] !== 0x79 || b[i + 3] !== 0x70) continue; // "ftyp"
      const tamanho = ((b[i - 4] << 24) | (b[i - 3] << 16) | (b[i - 2] << 8) | b[i - 1]) >>> 0;
      if (tamanho >= 8 && tamanho <= 256) return i - 4;
    }
    return -1;
  }
  for (let i = 0; i + 4 <= b.length; i++) {
    if (b[i] !== 0x1a || b[i + 1] !== 0x45 || b[i + 2] !== 0xdf || b[i + 3] !== 0xa3) continue;
    // Confirma que é o cabeçalho (o DocType "webm" vem logo depois), não bytes iguais por acaso no vídeo.
    if (String.fromCharCode(...b.subarray(i + 4, i + 64)).includes('webm')) return i;
  }
  return -1;
}

function terminaCom(a: Uint8Array, fim: Uint8Array) {
  if (fim.length > a.length) return false;
  const d = a.length - fim.length;
  for (let i = 0; i < fim.length; i++) if (a[d + i] !== fim[i]) return false;
  return true;
}

/** Grava a duração no cabeçalho do WebM (o navegador não grava; sem ela o player não avança/volta). */
async function comDuracao(bytes: Uint8Array, ms: number) {
  // fix-webm-duration lê o Blob com FileReader, que o Node não tem.
  const g = globalThis as { FileReader?: unknown };
  g.FileReader ??= class {
    result: ArrayBuffer | null = null;
    onloadend: (() => void) | null = null;
    readAsArrayBuffer(b: Blob) { void b.arrayBuffer().then((r) => { this.result = r; this.onloadend?.(); }); }
  };
  const blob = await fixWebmDuration(new Blob([bytes as BlobPart]), ms, { logger: false });
  return new Uint8Array(await blob.arrayBuffer());
}

/**
 * Conserta as partes (em ordem) que começam fora do cabeçalho: a sobra do começo volta para o fim
 * da parte anterior. Só lê o começo de cada arquivo para saber se precisa; partes sãs não são
 * baixadas inteiras (a não ser a anterior a uma parte com defeito). Devolve quantas foram consertadas.
 */
export async function repararPartes(partes: Parte[], io: Acesso) {
  type Carregada = { parte: Parte; bytes?: Uint8Array; mudou: boolean };
  let consertadas = 0;
  let anterior: Carregada | null = null;
  for (const parte of [...partes].sort((a, b) => a.indice - b.indice)) {
    let inicio = inicioDoArquivo(await io.baixar(parte.caminho, AMOSTRA), parte.mime);
    let bytes: Uint8Array | undefined;
    if (inicio < 0) {
      // Não achou no começo: confere o arquivo inteiro. Sem cabeçalho nenhum, não há o que consertar.
      bytes = await io.baixar(parte.caminho);
      inicio = inicioDoArquivo(bytes, parte.mime);
    }
    if (inicio <= 0) {
      if (anterior?.mudou) await io.gravar(anterior.parte, anterior.bytes!);
      anterior = { parte, bytes, mudou: false };
      continue;
    }

    bytes ??= await io.baixar(parte.caminho);
    const sobra = bytes.subarray(0, inicio);
    let propria = bytes.subarray(inicio);
    if (parte.mime.includes('webm')) propria = await comDuracao(propria, parte.duracao_ms);
    // A sobra é o fim da parte anterior (gravada logo antes, na mesma sessão). Se um conserto
    // anterior parou no meio, a anterior pode já ter recebido a sobra: não junta duas vezes.
    if (anterior && anterior.parte.indice === parte.indice - 1) {
      const antes: Uint8Array = anterior.bytes ?? (await io.baixar(anterior.parte.caminho));
      if (!terminaCom(antes, sobra)) {
        const junto = new Uint8Array(antes.length + sobra.length);
        junto.set(antes);
        junto.set(sobra, antes.length);
        anterior.bytes = junto;
        anterior.mudou = true;
      }
    }
    if (anterior?.mudou) await io.gravar(anterior.parte, anterior.bytes!);
    anterior = { parte, bytes: propria, mudou: true };
    consertadas++;
  }
  if (anterior?.mudou) await io.gravar(anterior.parte, anterior.bytes!);
  return consertadas;
}
