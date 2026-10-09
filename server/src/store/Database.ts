import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export type { DatabaseSync };

/**
 * Esquema em passos. Cada passo roda uma vez, em ordem; `PRAGMA user_version`
 * guarda até onde o banco já foi. Para mudar o esquema, acrescente um passo
 * novo no fim — nunca edite um que já foi publicado.
 */
const MIGRATIONS: string[] = [
  `
  CREATE TABLE users (
    id                TEXT PRIMARY KEY,
    username          TEXT NOT NULL,
    username_key      TEXT NOT NULL UNIQUE,
    password_hash     TEXT NOT NULL,
    email             TEXT,
    email_key         TEXT UNIQUE,
    email_verified    INTEGER NOT NULL DEFAULT 0,
    verify_token_hash TEXT,
    verify_expires_at INTEGER,
    reset_token_hash  TEXT,
    reset_expires_at  INTEGER,
    created_at        INTEGER NOT NULL
  ) STRICT;

  CREATE TABLE sessions (
    token_hash   TEXT PRIMARY KEY,
    user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at   INTEGER NOT NULL,
    last_seen_at INTEGER NOT NULL
  ) STRICT;
  CREATE INDEX sessions_user ON sessions(user_id);

  -- Amigos e pedidos de amizade, do ponto de vista de user_id.
  CREATE TABLE friend_links (
    user_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind     TEXT NOT NULL CHECK (kind IN ('friend', 'incoming', 'outgoing')),
    other_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    PRIMARY KEY (user_id, kind, other_id)
  ) STRICT;

  CREATE TABLE reports (
    id               TEXT PRIMARY KEY,
    at               INTEGER NOT NULL,
    reason           TEXT NOT NULL,
    note             TEXT,
    room_id          TEXT NOT NULL,
    reporter_key     TEXT NOT NULL,
    reporter_user_id TEXT,
    reporter_name    TEXT NOT NULL,
    target_key       TEXT NOT NULL,
    target_user_id   TEXT,
    target_name      TEXT NOT NULL,
    UNIQUE (reporter_key, target_key, room_id)
  ) STRICT;
  CREATE INDEX reports_target ON reports(target_key);
  `,
];

export const DB_FILE = 'intriga.db';

/** Abre (ou cria) `<dataDir>/intriga.db` e aplica os passos de esquema pendentes. */
export function openDatabase(dataDir: string): DatabaseSync {
  fs.mkdirSync(dataDir, { recursive: true });
  const file = path.join(dataDir, DB_FILE);
  const db = new DatabaseSync(file);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 5000;
  `);
  try {
    // Hashes de senha e de sessão: só o dono do processo lê.
    fs.chmodSync(file, 0o600);
  } catch {
    /* sistemas sem permissões POSIX */
  }
  migrate(db);
  return db;
}

function migrate(db: DatabaseSync) {
  const { user_version } = db.prepare('PRAGMA user_version').get() as { user_version: number };
  if (user_version > MIGRATIONS.length) {
    throw new Error(
      `O banco está no esquema ${user_version}, mais novo que este servidor (${MIGRATIONS.length}).`,
    );
  }
  for (let v = user_version; v < MIGRATIONS.length; v++) {
    transaction(db, () => {
      db.exec(MIGRATIONS[v]!);
      db.exec(`PRAGMA user_version = ${v + 1}`);
    });
  }
}

/** Roda [fn] numa transação; se já houver uma aberta, roda dentro dela. */
export function transaction<T>(db: DatabaseSync, fn: () => T): T {
  if (db.isTransaction) return fn();
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}
