import fs from 'node:fs';
import path from 'node:path';

/**
 * Um documento JSON persistido em disco. Lido inteiro na partida, gravado
 * de forma atômica (arquivo temporário + rename) com um pequeno atraso para
 * agrupar várias mudanças seguidas numa só escrita.
 */
export class JsonFile<T extends object> {
  data: T;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private dirty = false;

  constructor(
    readonly file: string,
    fallback: () => T,
    private readonly delayMs = 150,
  ) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    let loaded: unknown;
    try {
      loaded = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        // Arquivo corrompido: guarda uma cópia e recomeça, sem derrubar o servidor.
        const backup = `${file}.corrupt-${Date.now()}`;
        console.error(`[store] ${file} ilegível, movido para ${backup}:`, err);
        try {
          fs.renameSync(file, backup);
        } catch {
          /* ignora */
        }
      }
    }
    this.data =
      loaded && typeof loaded === 'object' && !Array.isArray(loaded)
        ? { ...fallback(), ...(loaded as T) }
        : fallback();
  }

  /** Marca como alterado; grava logo em seguida. */
  save() {
    this.dirty = true;
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = undefined;
      this.flush();
    }, this.delayMs);
    this.timer.unref?.();
  }

  /** Grava agora, se houver mudança pendente. */
  flush() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
    if (!this.dirty) return;
    this.dirty = false;
    const tmp = `${this.file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 1), { mode: 0o600 });
    fs.renameSync(tmp, this.file);
  }
}
