// Fila de envio para o Supabase Storage: um arquivo por vez, com novas tentativas.
type Tarefa = { rotulo: string; executar: () => Promise<void> };

export class FilaDeEnvio {
  private fila: Tarefa[] = [];
  private rodando = false;
  private ociosa: (() => void)[] = [];
  erros: string[] = [];

  constructor(private aoMudar: (pendentes: number) => void) {}

  get pendentes() {
    return this.fila.length + (this.rodando ? 1 : 0);
  }

  adicionar(rotulo: string, executar: () => Promise<void>) {
    this.fila.push({ rotulo, executar });
    this.aoMudar(this.pendentes);
    void this.processar();
  }

  /** Resolve quando todos os envios terminaram. */
  esperar(): Promise<void> {
    if (!this.pendentes) return Promise.resolve();
    return new Promise((ok) => this.ociosa.push(ok));
  }

  private async processar() {
    if (this.rodando) return;
    this.rodando = true;
    while (this.fila.length) {
      const t = this.fila.shift()!;
      this.aoMudar(this.pendentes);
      for (let tentativa = 1; ; tentativa++) {
        try {
          await t.executar();
          break;
        } catch (e) {
          if (tentativa >= 4) {
            this.erros.push(`${t.rotulo}: ${e instanceof Error ? e.message : e}`);
            break;
          }
          await new Promise((ok) => setTimeout(ok, 1500 * 2 ** (tentativa - 1)));
        }
      }
    }
    this.rodando = false;
    this.aoMudar(0);
    this.ociosa.splice(0).forEach((f) => f());
  }
}
