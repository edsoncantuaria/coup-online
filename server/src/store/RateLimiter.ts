/** Janela deslizante simples: no máximo `limit` eventos por `windowMs` por chave. */
export class RateLimiter {
  private hits = new Map<string, number[]>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
  ) {}

  /** Registra um evento; `false` se a chave já estourou o limite. */
  hit(key: string, now = Date.now()): boolean {
    const list = this.recent(key, now);
    if (list.length >= this.limit) return false;
    list.push(now);
    this.hits.set(key, list);
    if (this.hits.size > 10_000) this.prune(now);
    return true;
  }

  /** Esquece a chave (ex.: login bem-sucedido zera as falhas). */
  reset(key: string) {
    this.hits.delete(key);
  }

  private recent(key: string, now: number): number[] {
    const list = this.hits.get(key);
    if (!list) return [];
    const fresh = list.filter((t) => now - t < this.windowMs);
    if (fresh.length) this.hits.set(key, fresh);
    else this.hits.delete(key);
    return fresh;
  }

  private prune(now: number) {
    for (const key of [...this.hits.keys()]) this.recent(key, now);
  }
}
