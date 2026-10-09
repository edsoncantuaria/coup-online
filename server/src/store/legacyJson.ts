import fs from 'node:fs';
import path from 'node:path';
import { transaction, type DatabaseSync } from './Database.js';

/*
 * Antes do SQLite, contas e denúncias ficavam em `accounts.json` e
 * `reports.json`. Na primeira subida com o banco, o conteúdo deles é copiado
 * para as tabelas e o arquivo é renomeado para `*.imported`, para não ser
 * lido de novo (e continuar à mão, caso precise conferir algo).
 */

type LegacyUser = {
  id: string;
  username: string;
  usernameKey: string;
  passwordHash: string;
  email?: string;
  emailKey?: string;
  emailVerified?: boolean;
  verifyTokenHash?: string;
  verifyExpiresAt?: number;
  resetTokenHash?: string;
  resetExpiresAt?: number;
  createdAt: number;
  friends?: string[];
  incoming?: string[];
  outgoing?: string[];
};

type LegacySession = { tokenHash: string; userId: string; createdAt: number; lastSeenAt: number };

type LegacyParty = { userId?: string; name: string; key: string };

type LegacyReport = {
  id: string;
  at: number;
  reason: string;
  note?: string;
  roomId: string;
  reporter: LegacyParty;
  target: LegacyParty;
};

function readLegacy<T>(file: string): T | undefined {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw new Error(`Não foi possível ler ${file} para importar no banco: ${String(err)}`);
  }
}

function isEmpty(db: DatabaseSync, table: 'users' | 'reports') {
  return !db.prepare(`SELECT 1 FROM ${table} LIMIT 1`).get();
}

function markImported(file: string) {
  fs.renameSync(file, `${file}.imported`);
}

export function importLegacyJson(db: DatabaseSync, dataDir: string) {
  importAccounts(db, path.join(dataDir, 'accounts.json'));
  importReports(db, path.join(dataDir, 'reports.json'));
}

function importAccounts(db: DatabaseSync, file: string) {
  const doc = readLegacy<{ users?: LegacyUser[]; sessions?: LegacySession[] }>(file);
  if (!doc) return;
  if (!isEmpty(db, 'users')) {
    console.warn(`[db] ${file} ignorado: o banco já tem contas.`);
    return;
  }
  const users = doc.users ?? [];
  const ids = new Set(users.map((u) => u.id));
  transaction(db, () => {
    const insUser = db.prepare(`
      INSERT INTO users (id, username, username_key, password_hash, email, email_key, email_verified,
        verify_token_hash, verify_expires_at, reset_token_hash, reset_expires_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    for (const u of users) {
      insUser.run(
        u.id,
        u.username,
        u.usernameKey,
        u.passwordHash,
        u.email ?? null,
        u.emailKey ?? null,
        u.emailVerified ? 1 : 0,
        u.verifyTokenHash ?? null,
        u.verifyExpiresAt ?? null,
        u.resetTokenHash ?? null,
        u.resetExpiresAt ?? null,
        u.createdAt,
      );
    }
    const insLink = db.prepare(
      'INSERT OR IGNORE INTO friend_links (user_id, kind, other_id, position) VALUES (?, ?, ?, ?)',
    );
    for (const u of users) {
      for (const kind of ['friend', 'incoming', 'outgoing'] as const) {
        const list = (kind === 'friend' ? u.friends : u[kind]) ?? [];
        list.filter((id) => ids.has(id)).forEach((id, i) => insLink.run(u.id, kind, id, i));
      }
    }
    const insSession = db.prepare(
      'INSERT OR IGNORE INTO sessions (token_hash, user_id, created_at, last_seen_at) VALUES (?, ?, ?, ?)',
    );
    for (const s of doc.sessions ?? []) {
      if (ids.has(s.userId)) insSession.run(s.tokenHash, s.userId, s.createdAt, s.lastSeenAt);
    }
  });
  markImported(file);
  console.log(`[db] ${users.length} conta(s) importada(s) de ${file}.`);
}

function importReports(db: DatabaseSync, file: string) {
  const doc = readLegacy<{ reports?: LegacyReport[] }>(file);
  if (!doc) return;
  if (!isEmpty(db, 'reports')) {
    console.warn(`[db] ${file} ignorado: o banco já tem denúncias.`);
    return;
  }
  const reports = doc.reports ?? [];
  transaction(db, () => {
    const ins = db.prepare(`
      INSERT OR IGNORE INTO reports (id, at, reason, note, room_id, reporter_key, reporter_user_id,
        reporter_name, target_key, target_user_id, target_name)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    for (const r of reports) {
      ins.run(
        r.id,
        r.at,
        r.reason,
        r.note ?? null,
        r.roomId,
        r.reporter.key,
        r.reporter.userId ?? null,
        r.reporter.name,
        r.target.key,
        r.target.userId ?? null,
        r.target.name,
      );
    }
  });
  markImported(file);
  console.log(`[db] ${reports.length} denúncia(s) importada(s) de ${file}.`);
}
