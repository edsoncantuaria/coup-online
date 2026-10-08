import crypto from 'node:crypto';
import path from 'node:path';
import { AppError, cleanText } from '../errors.js';
import { JsonFile } from '../store/JsonFile.js';
import { RateLimiter } from '../store/RateLimiter.js';

export const REPORT_REASONS = ['voice_abuse', 'anti_game'] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

export type Party = {
  /** Conta do jogador, se estava logado. */
  userId?: string;
  /** Nome que aparecia na mesa. */
  name: string;
};

export type ReportRecord = {
  id: string;
  at: number;
  reason: ReportReason;
  note?: string;
  roomId: string;
  reporter: Party & { key: string };
  target: Party & { key: string };
};

type ReportCount = { name: string; total: number; voice_abuse: number; anti_game: number; lastAt: number };

type ReportsDoc = {
  version: 1;
  reports: ReportRecord[];
  /** Total de denúncias por jogador denunciado (`userId` ou `guest:<nome>`). */
  counts: Record<string, ReportCount>;
};

export type ReportLimits = { limit: number; windowMs: number };

/**
 * Denúncias de jogadores (abuso no chat de voz, antijogo). Gravadas em
 * `<dataDir>/reports.json`; não há painel de moderação por enquanto.
 */
export class ReportService {
  private store: JsonFile<ReportsDoc>;
  private limiter: RateLimiter;

  constructor(dataDir: string, limits: ReportLimits) {
    this.store = new JsonFile<ReportsDoc>(path.join(dataDir, 'reports.json'), () => ({
      version: 1,
      reports: [],
      counts: {},
    }));
    this.limiter = new RateLimiter(limits.limit, limits.windowMs);
  }

  static keyOf(p: Party): string {
    return p.userId ?? `guest:${p.name.toLowerCase()}`;
  }

  /**
   * Registra uma denúncia. `reporterKey` é a conta de quem denuncia ou, para
   * convidados, o IP — o limite vale por essa chave.
   */
  report(input: {
    reporterKey: string;
    reporter: Party;
    target: Party;
    roomId: string;
    reason: unknown;
    note: unknown;
  }): ReportRecord {
    const reason = input.reason as ReportReason;
    if (!REPORT_REASONS.includes(reason)) {
      throw new AppError('INVALID', 'Motivo de denúncia inválido.');
    }
    if (input.note !== undefined && input.note !== null && typeof input.note !== 'string') {
      throw new AppError('INVALID', 'Observação inválida.');
    }
    const note = typeof input.note === 'string' ? cleanText(input.note, 280) : '';
    const targetKey = ReportService.keyOf(input.target);
    const dup = this.store.data.reports.some(
      (r) => r.reporter.key === input.reporterKey && r.target.key === targetKey && r.roomId === input.roomId,
    );
    if (dup) throw new AppError('DUPLICATE', 'Você já denunciou esse jogador nesta partida.');
    if (!this.limiter.hit(input.reporterKey)) {
      throw new AppError('RATE_LIMITED', 'Muitas denúncias em pouco tempo. Tente mais tarde.');
    }
    const rec: ReportRecord = {
      id: `r_${crypto.randomBytes(8).toString('base64url')}`,
      at: Date.now(),
      reason,
      ...(note ? { note } : {}),
      roomId: input.roomId,
      reporter: { ...input.reporter, key: input.reporterKey },
      target: { ...input.target, key: targetKey },
    };
    this.store.data.reports.push(rec);
    const c = (this.store.data.counts[targetKey] ??= {
      name: input.target.name,
      total: 0,
      voice_abuse: 0,
      anti_game: 0,
      lastAt: 0,
    });
    c.name = input.target.name;
    c.total += 1;
    c[reason] += 1;
    c.lastAt = rec.at;
    this.store.save();
    return rec;
  }

  countFor(key: string): ReportCount | undefined {
    return this.store.data.counts[key];
  }

  flush() {
    this.store.flush();
  }
}
