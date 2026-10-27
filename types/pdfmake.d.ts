// Tipos mínimos do pdfmake 0.3 (o pacote não traz declarações). Só o que lib/pop/pdf.ts usa.
declare module 'pdfmake' {
  interface DocumentoPdf {
    getBuffer(): Promise<Buffer>;
  }
  interface Pdfmake {
    /** Arquivos (fontes) registrados por nome, lidos na geração. */
    virtualfs: { writeFileSync(nome: string, conteudo: Buffer): void; existsSync(nome: string): boolean };
    addFonts(fontes: Record<string, { normal: string; bold: string; italics: string; bolditalics: string }>): void;
    setLocalAccessPolicy(permitir: (caminho: string) => boolean): void;
    setUrlAccessPolicy(permitir: (url: string) => boolean): void;
    createPdf(definicao: Record<string, unknown>): DocumentoPdf;
  }
  const pdfmake: Pdfmake;
  export default pdfmake;
}
