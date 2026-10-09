import crypto from 'node:crypto';
import { AppError, cleanText } from '../errors.js';
import type { DatabaseSync } from '../store/Database.js';
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

/** Total de denúncias de um jogador denunciado (`userId` ou `guest:<nome>`). */
export type ReportCount = { name: string; total: number; voice_abuse: number; anti_game: number; lastAt: number };

export type ReportLimits = { limit: number; windowMs: number };

/**
 * Denúncias de jogadores (abuso no chat de voz, antijogo). Gravadas na
 * tabela `reports` do SQLite; não há painel de moderação por enquanto.
 */
export class ReportService {
  private limiter: RateLimiter;

  constructor(
    private db: DatabaseSync,
    limits: ReportLimits,
  ) {
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
    const dup = this.db
      .prepare('SELECT 1 FROM reports WHERE reporter_key = ? AND target_key = ? AND room_id = ?')
      .get(input.reporterKey, targetKey, input.roomId);
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
    this.db
      .prepare(
        `INSERT INTO reports (id, at, reason, note, room_id, reporter_key, reporter_user_id,
           reporter_name, target_key, target_user_id, target_name)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        rec.id,
        rec.at,
        rec.reason,
        rec.note ?? null,
        rec.roomId,
        rec.reporter.key,
        rec.reporter.userId ?? null,
        rec.reporter.name,
        rec.target.key,
        rec.target.userId ?? null,
        rec.target.name,
      );
    return rec;
  }

  countFor(key: string): ReportCount | undefined {
    const row = this.db
      .prepare(
        `SELECT COUNT(*) AS total,
                SUM(reason = 'voice_abuse') AS voice_abuse,
                SUM(reason = 'anti_game') AS anti_game,
                MAX(at) AS lastAt,
                (SELECT target_name FROM reports WHERE target_key = ?1 ORDER BY at DESC, rowid DESC LIMIT 1)
                  AS name
           FROM reports WHERE target_key = ?1`,
      )
      .get(key) as ReportCount | undefined;
    return row && row.total > 0 ? { ...row } : undefined;
  }
}
